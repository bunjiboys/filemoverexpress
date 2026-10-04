package workflow

import (
	"context"
	"sync"
)

// controlCancel, controlPause, and controlResume are the lifecycle control-message kinds
// delivered to the running scheduler. controlBuffer sizes the control channel so lifecycle
// sends do not block or drop while the run is active.
const (
	controlCancel controlKind = iota
	controlPause
	controlResume

	controlBuffer = 8
)

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
	// pure graph functions in dag.go. It also serves the run lifecycle operations
	// (cancel/pause/resume) against the single run it is executing.
	Engine struct {
		exec      StepExecutor
		maxActive int
		// Jobs, when set, is the cascade to in-flight Job steps' jobs on cancel/pause/
		// resume (format doc "Lifecycle operations"). Keyed by step id; the production
		// adapter resolves step id to runtime job id. Nil disables the cascade.
		Jobs JobLifecycle
		// OnStepStatus, when set, is called on every step status transition (run-level
		// event emission). It may be called from the scheduler goroutine.
		OnStepStatus func(stepID string, status StepStatus)
		// OnRunStatus, when set, is called on every run status transition.
		OnRunStatus func(status RunStatus)

		controlMu sync.Mutex
		control   chan controlMsg
	}

	// JobLifecycle cascades a run lifecycle operation to the job a Job step created. It is
	// keyed by step id; the production implementation maps the step to its runtime job and
	// calls the job manager's CancelJob/PauseJob/ResumeJob. A fake records the calls in
	// tests, so the engine's cascade logic is covered without a live job manager.
	JobLifecycle interface {
		Cancel(stepID string)
		Pause(stepID string)
		Resume(stepID string)
	}

	// controlKind is the kind of a lifecycle control message delivered to the scheduler.
	controlKind int

	// controlMsg is a lifecycle request delivered to the running scheduler over its
	// control channel. pauseJobs applies only to a pause.
	controlMsg struct {
		kind      controlKind
		pauseJobs bool
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
	// the step list, each step's status, the completed/started/running id sets, the
	// completion channel, and the lifecycle flags set by control messages. Bundling it
	// keeps the helpers within the argument limit and makes the single-owner invariant
	// explicit.
	schedState struct {
		ctx       context.Context
		steps     []Step
		status    map[string]StepStatus
		completed map[string]bool
		started   map[string]bool
		running   map[string]bool
		done      chan stepDone
		paused    bool
		cancelled bool
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
// running nothing. The scheduler state is owned by this one goroutine and mutated only as
// worker completions and lifecycle control messages arrive over channels, so there is no
// shared-state race and the control flow is deterministic for a given set of outcomes.
func (e *Engine) Run(ctx context.Context, doc Document) RunResult {
	steps := doc.Spec.Steps
	status := initStatuses(steps)

	if _, err := TopologicalOrder(steps); err != nil {
		e.emitRunStatus(RunFailed)
		return RunResult{Status: RunFailed, Steps: status}
	}

	control := e.openControl()
	defer e.closeControl()

	e.emitRunStatus(RunRunning)
	st := e.schedule(ctx, steps, status, control)

	final := e.finalStatus(steps, status, st)
	e.emitRunStatus(final)
	return RunResult{Status: final, Steps: status}
}

// finalStatus is CANCELLED when the run was cancelled via the lifecycle, otherwise the
// status derived from the step outcomes.
func (*Engine) finalStatus(steps []Step, status map[string]StepStatus, st *schedState) RunStatus {
	if st.cancelled {
		return RunCancelled
	}
	return DeriveRunStatus(steps, status)
}

// openControl creates the control channel for this run and publishes it so the lifecycle
// methods can reach the running scheduler. It is buffered so a lifecycle send lands even
// when the scheduler is momentarily not in its select (e.g. launching a step); the
// scheduler drains it on the next loop turn. closeControl clears it when the run ends.
func (e *Engine) openControl() chan controlMsg {
	e.controlMu.Lock()
	defer e.controlMu.Unlock()
	e.control = make(chan controlMsg, controlBuffer)
	return e.control
}

func (e *Engine) closeControl() {
	e.controlMu.Lock()
	defer e.controlMu.Unlock()
	e.control = nil
}

// initStatuses marks every step PENDING in a fresh status map.
func initStatuses(steps []Step) map[string]StepStatus {
	status := make(map[string]StepStatus, len(steps))
	for i := range steps {
		status[steps[i].ID] = StepPending
	}
	return status
}

// schedule is the scheduler loop: it launches ready steps up to maxActive (unless paused),
// then blocks on either a step completion or a lifecycle control message, applying each and
// launching newly-eligible steps, until no steps are in flight and nothing more can launch.
// It returns the final scheduler state (notably whether the run was cancelled).
func (e *Engine) schedule(ctx context.Context, steps []Step, status map[string]StepStatus, control chan controlMsg) *schedState {
	st := &schedState{
		ctx:       ctx,
		steps:     steps,
		status:    status,
		completed: make(map[string]bool, len(steps)),
		started:   make(map[string]bool, len(steps)),
		running:   make(map[string]bool, len(steps)),
		done:      make(chan stepDone),
	}
	e.launchReady(st)
	for loopAlive(st) {
		select {
		case res := <-st.done:
			delete(st.running, res.id)
			e.applyOutcome(st, res)
			e.launchReady(st)
		case msg := <-control:
			e.handleControl(st, msg)
			e.launchReady(st)
		}
	}
	return st
}

// loopAlive reports whether the scheduler should keep waiting. It stays alive while any
// step is in flight, while more steps can still launch, and while the run is paused with
// unfinished work (waiting for resume or cancel). A cancelled run with nothing in flight
// is done.
func loopAlive(st *schedState) bool {
	if len(st.running) > 0 {
		return true
	}
	if st.cancelled {
		return false
	}
	if st.paused {
		return hasUnfinished(st)
	}
	return len(ReadySteps(st.steps, st.completed, st.started)) > 0
}

// hasUnfinished reports whether any step has not reached completion yet.
func hasUnfinished(st *schedState) bool {
	for i := range st.steps {
		if !st.completed[st.steps[i].ID] {
			return true
		}
	}
	return false
}

// handleControl applies a lifecycle control message to the scheduler state and cascades to
// in-flight jobs as the format doc specifies.
func (e *Engine) handleControl(st *schedState, msg controlMsg) {
	switch msg.kind {
	case controlCancel:
		e.doCancel(st)
	case controlPause:
		st.paused = true
		if msg.pauseJobs {
			e.cascade(st, JobLifecycle.Pause)
		}
	case controlResume:
		st.paused = false
		e.cascade(st, JobLifecycle.Resume)
	}
}

// doCancel marks the run cancelled: every not-yet-started step becomes SKIPPED and each
// in-flight Job step's job is cancelled. In-flight steps finish via their context.
func (e *Engine) doCancel(st *schedState) {
	st.cancelled = true
	e.cascade(st, JobLifecycle.Cancel)
	for i := range st.steps {
		id := st.steps[i].ID
		if !st.completed[id] && !st.running[id] {
			st.completed[id] = true
			e.setStatus(st.status, id, StepSkipped)
		}
	}
}

// cascade invokes op for every currently in-flight step, via the injected JobLifecycle.
// It is a no-op when no cascade is configured.
func (e *Engine) cascade(st *schedState, op func(JobLifecycle, string)) {
	if e.Jobs == nil {
		return
	}
	for id := range st.running {
		op(e.Jobs, id)
	}
}

// launchReady starts every currently-eligible step, bounded by the free worker slots. It
// launches nothing while paused or cancelled. A step whose dependency was skipped/failed
// never becomes ready (its dependsOn is not in completed), so it is handled by
// applyOutcome, not here.
func (e *Engine) launchReady(st *schedState) {
	if st.paused || st.cancelled {
		return
	}
	for _, id := range ReadySteps(st.steps, st.completed, st.started) {
		if len(st.running) >= e.maxActive {
			break
		}
		st.started[id] = true
		st.running[id] = true
		e.setStatus(st.status, id, StepRunning)
		go func(step Step) {
			st.done <- stepDone{id: step.ID, err: e.exec.Execute(st.ctx, step)}
		}(stepByID(st.steps, id))
	}
}

// applyOutcome records a completed step's result. On success it marks SUCCEEDED. On a
// failure it marks FAILED and, unless the step is continueOnError, marks every transitive
// dependent SKIPPED (and completed, so they are never launched) per decision 3. A step
// that finished after a cancel keeps whatever terminal status it reports.
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
		if st.completed[dep] {
			continue
		}
		st.completed[dep] = true
		e.setStatus(st.status, dep, StepSkipped)
	}
}

// emitRunStatus notifies the run-status observer when one is set.
func (e *Engine) emitRunStatus(s RunStatus) {
	if e.OnRunStatus != nil {
		e.OnRunStatus(s)
	}
}

// CancelRun marks the active run CANCELLED, skipping not-yet-started steps and cascading to
// in-flight jobs. It is a no-op when no run is active or the run already finished (format
// doc "Lifecycle operations": idempotent once terminal).
func (e *Engine) CancelRun() { e.sendControl(controlMsg{kind: controlCancel}) }

// PauseRun gates the scheduler so no new steps start; pauseInFlightJobs additionally pauses
// each in-flight Job step's job. No-op without an active run.
func (e *Engine) PauseRun(pauseInFlightJobs bool) {
	e.sendControl(controlMsg{kind: controlPause, pauseJobs: pauseInFlightJobs})
}

// ResumeRun un-gates a paused run and resumes any jobs paused by a pauseInFlightJobs pause.
// No-op without an active run.
func (e *Engine) ResumeRun() { e.sendControl(controlMsg{kind: controlResume}) }

// sendControl delivers a lifecycle message to the running scheduler, or does nothing if no
// run is active. The send races the scheduler's own exit; a buffered-less channel with no
// receiver would block, so the capture-under-lock plus a select-with-default keeps it a
// safe no-op once the run has ended.
func (e *Engine) sendControl(msg controlMsg) {
	e.controlMu.Lock()
	ch := e.control
	e.controlMu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- msg:
	default:
	}
}

// setStatus updates a step's status and notifies the observer when one is set.
func (e *Engine) setStatus(status map[string]StepStatus, id string, s StepStatus) {
	status[id] = s
	if e.OnStepStatus != nil {
		e.OnStepStatus(id, s)
	}
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
