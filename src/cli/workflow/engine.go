package workflow

import "context"

type (
	// StepExecutor runs one step's work in-process and returns an error if the step
	// failed. Concrete executors (Job, Checksum, Sleep, InventoryReport) are registered in
	// Phase E; the engine depends only on this interface, so it is tested with a fake and
	// never performs a real transfer. Execute must honor ctx cancellation.
	StepExecutor interface {
		Execute(ctx context.Context, step Step) error
	}

	// Engine is the DAG scheduler: it runs a document's steps in dependency order,
	// bounded by maxActive, gating each step on its dependsOn, aborting the transitive
	// dependents of a non-continueOnError failure while independent branches continue
	// (format doc "Execution model" / decision 3). It is a thin async driver over the
	// pure graph functions in dag.go.
	Engine struct {
		exec      StepExecutor
		maxActive int
		// OnStepStatus, when set, is called on every step status transition (for
		// run-level event emission in a later phase). It may be called from the scheduler
		// goroutine; the callback must be safe for that.
		OnStepStatus func(stepID string, status StepStatus)
	}

	// RunResult is the terminal outcome of a Run: the derived run status and each step's
	// final status.
	RunResult struct {
		Status RunStatus
		Steps  map[string]StepStatus
	}

	// stepDone carries one step's completion from a worker goroutine back to the
	// scheduler loop.
	stepDone struct {
		id  string
		err error
	}

	// schedState is the mutable scheduler state owned by the single schedule goroutine:
	// the step list, each step's status, the completed and started id sets, and the
	// channel workers report completions on. Bundling it keeps the launch/apply helpers
	// within the argument limit and makes the single-owner invariant explicit.
	schedState struct {
		ctx       context.Context
		steps     []Step
		status    map[string]StepStatus
		completed map[string]bool
		started   map[string]bool
		done      chan stepDone
	}
)

// NewEngine builds an Engine over the given executor and concurrency limit. A non-positive
// limit is floored to 1 (serial) so the scheduler never deadlocks on a zero slot count.
func NewEngine(exec StepExecutor, maxActive int) *Engine {
	if maxActive < 1 {
		maxActive = 1
	}
	return &Engine{exec: exec, maxActive: maxActive}
}

// Run executes the whole document and returns the terminal run status plus every step's
// final status. It assumes the document was validated (ValidateStructure) upstream; as a
// guard it still computes a topological order and fails the run if the graph is cyclic,
// running nothing. The scheduler state is owned by this one goroutine and mutated only
// as worker completions arrive over a channel, so there is no shared-state race and the
// control flow is deterministic for a given set of executor outcomes.
func (e *Engine) Run(ctx context.Context, doc Document) RunResult {
	steps := doc.Spec.Steps
	status := initStatuses(steps)

	if _, err := TopologicalOrder(steps); err != nil {
		return RunResult{Status: RunFailed, Steps: status}
	}

	e.schedule(ctx, steps, status)
	return RunResult{Status: deriveRunStatus(steps, status), Steps: status}
}

// initStatuses marks every step PENDING in a fresh status map.
func initStatuses(steps []Step) map[string]StepStatus {
	status := make(map[string]StepStatus, len(steps))
	for i := range steps {
		status[steps[i].ID] = StepPending
	}
	return status
}

// schedule is the scheduler loop: it launches ready steps up to maxActive, then blocks on
// each completion, applies the outcome (success, or failure that skips transitive
// dependents unless continueOnError), and launches any newly-eligible steps, until no
// steps are running and none remain launchable.
func (e *Engine) schedule(ctx context.Context, steps []Step, status map[string]StepStatus) {
	st := &schedState{
		ctx:       ctx,
		steps:     steps,
		status:    status,
		completed: make(map[string]bool, len(steps)),
		started:   make(map[string]bool, len(steps)),
		done:      make(chan stepDone),
	}
	active := e.launchReady(st)
	for active > 0 {
		res := <-st.done
		active--
		e.applyOutcome(st, res)
		active += e.launchReady(st)
	}
}

// launchReady starts every currently-eligible step, bounded by the free worker slots, and
// returns how many it launched. A step whose dependency was skipped/failed never becomes
// ready (its dependsOn is not in completed), so it is handled by applyOutcome, not here.
func (e *Engine) launchReady(st *schedState) int {
	launched := 0
	for _, id := range ReadySteps(st.steps, st.completed, st.started) {
		if runningCount(st.status) >= e.maxActive {
			break
		}
		st.started[id] = true
		e.setStatus(st.status, id, StepRunning)
		launched++
		go func(step Step) {
			st.done <- stepDone{id: step.ID, err: e.exec.Execute(st.ctx, step)}
		}(stepByID(st.steps, id))
	}
	return launched
}

// applyOutcome records a completed step's result. On success it marks SUCCEEDED. On a
// failure it marks FAILED and, unless the step is continueOnError, marks every transitive
// dependent SKIPPED (and completed, so they are never launched) per decision 3.
func (e *Engine) applyOutcome(st *schedState, res stepDone) {
	st.completed[res.id] = true
	if res.err == nil {
		e.setStatus(st.status, res.id, StepSucceeded)
		return
	}
	e.setStatus(st.status, res.id, StepFailed)
	if stepByID(st.steps, res.id).ContinueOnError {
		return
	}
	for dep := range TransitiveDependents(st.steps, res.id) {
		st.completed[dep] = true
		e.setStatus(st.status, dep, StepSkipped)
	}
}

// runningCount returns how many steps are currently RUNNING, used to respect maxActive.
func runningCount(status map[string]StepStatus) int {
	n := 0
	for _, s := range status {
		if s == StepRunning {
			n++
		}
	}
	return n
}

// setStatus updates a step's status and notifies the observer when one is set.
func (e *Engine) setStatus(status map[string]StepStatus, id string, s StepStatus) {
	status[id] = s
	if e.OnStepStatus != nil {
		e.OnStepStatus(id, s)
	}
}

// deriveRunStatus derives the run's terminal status from its step statuses (format doc
// "Run and step status model"): FAILED if any step FAILED without continueOnError,
// otherwise SUCCEEDED. A step left PENDING cannot happen after schedule returns, but is
// treated as not-failed so the function is total.
func deriveRunStatus(steps []Step, status map[string]StepStatus) RunStatus {
	for i := range steps {
		if status[steps[i].ID] == StepFailed && !steps[i].ContinueOnError {
			return RunFailed
		}
	}
	return RunSucceeded
}

// stepByID returns the step with the given id. The id always exists (it came from the
// same step slice), so the zero Step is never returned in practice.
func stepByID(steps []Step, id string) Step {
	for i := range steps {
		if steps[i].ID == id {
			return steps[i]
		}
	}
	// COVERAGE: justified-unreachable defensive branch. Every id passed to stepByID
	// originates from the same steps slice (ReadySteps / TransitiveDependents only yield
	// ids present in it), so the loop always returns above. Kept as a zero-value fallback
	// rather than panicking; not covered because no scheduler path produces an absent id.
	// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
	return Step{}
}
