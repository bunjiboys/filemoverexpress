package workflow

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/awslabs/filemoverexpress/events"
)

type (
	// WorkflowManager is the daemon-side owner of workflow runs: it validates a submitted
	// document, creates and persists a WorkflowRun, and drives the engine, persisting each
	// run/step transition to the RunStore (transition-only, per the format doc). It is the
	// seam the RunWorkflow service handler and the CLI call; the engine, store, and
	// registry are injected so it is testable with fakes.
	WorkflowManager struct {
		store         RunStore
		registry      Registry
		maxActive     int
		profileExists func(string) bool
		// JobLifecycleFactory, when set, builds the per-run JobLifecycle the engine
		// cascades cancel/pause/resume to, plus a cleanup to release it when the run ends.
		// Nil disables the job cascade (run-level lifecycle still works). It is a field,
		// not a constructor argument, so the engine package stays free of the job manager:
		// the service layer sets it to the JobCreateEvent-subscribing adapter.
		JobLifecycleFactory func(runID string) (JobLifecycle, func())

		mu       sync.Mutex
		engines  map[string]*Engine // active runs, by run id, for lifecycle operations
		cleanups map[string]func()  // per-run JobLifecycle teardown, by run id
		seq      uint64
	}
)

// NewWorkflowManager builds a manager over the given store, step-executor registry,
// concurrency limit, and transfer-profile existence check.
func NewWorkflowManager(store RunStore, registry Registry, maxActive int, profileExists func(string) bool) *WorkflowManager {
	return &WorkflowManager{
		store:         store,
		registry:      registry,
		maxActive:     maxActive,
		profileExists: profileExists,
		engines:       make(map[string]*Engine),
		cleanups:      make(map[string]func()),
	}
}

// Start parses and validates a submitted document; on any validation failure it returns
// the failures and an empty run id without creating a run. On acceptance it creates a run
// record, persists it, launches execution in the background, and returns the run id. A
// non-nil error is reserved for an unexpected internal failure (e.g. the initial store
// write); a parse failure or any content problem is a validation error, not an error.
func (m *WorkflowManager) Start(src []byte, format Format, params ParamInputs) (string, []ValidationError, error) {
	generic, doc, parseErr := Parse(src, format)
	if parseErr != nil {
		return "", []ValidationError{{Kind: KindSchema, Message: parseErr.Error()}}, nil
	}
	if verrs := Validate(generic, doc, params, m.profileExists); len(verrs) > 0 {
		return "", verrs, nil
	}

	run := NewWorkflowRun(m.nextRunID(), doc)
	if err := m.store.Save(run); err != nil {
		return "", nil, fmt.Errorf("workflow: persisting new run: %w", err)
	}

	m.launch(run, doc)
	return run.RunID, nil, nil
}

// Get returns the current persisted record for a run id.
func (m *WorkflowManager) Get(runID string) (*WorkflowRun, error) {
	return m.store.Load(runID)
}

// List returns every persisted run record, newest state included, for the ListWorkflowRuns
// surface.
func (m *WorkflowManager) List() ([]*WorkflowRun, error) {
	return m.store.List()
}

// Reconcile applies restart reconciliation to every persisted run on daemon boot: a run
// left PENDING/RUNNING/PAUSED by a previous process (whose in-memory jobs did not survive)
// is marked FAILED with its non-terminal steps fixed up, and only the changed records are
// rewritten. It returns the number of runs reconciled. Call it once at startup, before the
// service begins accepting new runs; a per-record save failure is logged (not fatal) and
// does not abort reconciling the rest, since a stale non-terminal record is a cosmetic
// inconsistency, not a reason to block the daemon from starting.
func (m *WorkflowManager) Reconcile() (int, error) {
	runs, err := m.store.List()
	if err != nil {
		return 0, fmt.Errorf("workflow: listing runs for reconciliation: %w", err)
	}
	changed := ReconcileAll(runs)
	for _, run := range changed {
		m.persist(run)
	}
	return len(changed), nil
}

// Cancel cancels an active run: it stops scheduling, skips not-yet-started steps, and
// cascades to in-flight jobs. It errors when the run id is unknown or already terminal
// (no active engine is tracked for it), so a handler can report that rather than silently
// succeeding on a finished run.
func (m *WorkflowManager) Cancel(runID string) error {
	engine, err := m.activeEngine(runID)
	if err != nil {
		return err
	}
	engine.CancelRun()
	return nil
}

// Pause gates an active run's scheduler so no new steps start; pauseInFlightJobs also
// pauses each in-flight Job step's job. It errors when the run is unknown or already
// terminal.
func (m *WorkflowManager) Pause(runID string, pauseInFlightJobs bool) error {
	engine, err := m.activeEngine(runID)
	if err != nil {
		return err
	}
	engine.PauseRun(pauseInFlightJobs)
	return nil
}

// Resume un-gates a paused active run and resumes any jobs paused by a pauseInFlightJobs
// pause. It errors when the run is unknown or already terminal.
func (m *WorkflowManager) Resume(runID string) error {
	engine, err := m.activeEngine(runID)
	if err != nil {
		return err
	}
	engine.ResumeRun()
	return nil
}

// activeEngine returns the engine driving an in-flight run, or an error when no run is
// active for the id. A run that already finished has been removed from the engines map by
// finish, so a lifecycle op on it is reported as a no-longer-active error (idempotent-once-
// terminal per the format doc), distinct from an unknown id, which the store can confirm.
func (m *WorkflowManager) activeEngine(runID string) (*Engine, error) {
	m.mu.Lock()
	engine, ok := m.engines[runID]
	m.mu.Unlock()
	if ok {
		return engine, nil
	}
	if _, err := m.store.Load(runID); err != nil {
		return nil, fmt.Errorf("workflow: run %s not found", runID)
	}
	return nil, fmt.Errorf("workflow: run %s is no longer active", runID)
}

// launch builds an engine for the run, wires transition-only persistence and run tracking,
// the per-run job-lifecycle cascade (when a factory is set), and executes the document in a
// background goroutine.
func (m *WorkflowManager) launch(run *WorkflowRun, doc Document) {
	engine := NewEngine(m.registry, m.maxActive)
	engine.OnStepStatus = m.onStepStatus(run.RunID)
	engine.OnRunStatus = m.onRunStatus(run.RunID)

	var cleanup func()
	if m.JobLifecycleFactory != nil {
		engine.Jobs, cleanup = m.JobLifecycleFactory(run.RunID)
	}

	m.mu.Lock()
	m.engines[run.RunID] = engine
	if cleanup != nil {
		m.cleanups[run.RunID] = cleanup
	}
	m.mu.Unlock()

	go func() {
		engine.Run(WithRunID(context.Background(), run.RunID), doc)
		m.finish(run.RunID)
	}()
}

// onStepStatus returns a step-transition callback that persists the step's new status onto
// the stored run record (transition-only write).
func (m *WorkflowManager) onStepStatus(runID string) func(string, StepStatus) {
	return func(stepID string, status StepStatus) {
		run, err := m.store.Load(runID)
		if err != nil {
			events.Events.Warn("workflow: loading run %s for step transition: %s", runID, err)
			return
		}
		for i := range run.Steps {
			if run.Steps[i].StepID == stepID {
				run.Steps[i].Status = status
			}
		}
		m.persist(run)
	}
}

// onRunStatus returns a run-transition callback that persists the run's new status and
// stamps the started/completed timestamps.
func (m *WorkflowManager) onRunStatus(runID string) func(RunStatus) {
	return func(status RunStatus) {
		run, err := m.store.Load(runID)
		if err != nil {
			events.Events.Warn("workflow: loading run %s for run transition: %s", runID, err)
			return
		}
		run.Status = status
		stampRunTimestamps(run, status)
		m.persist(run)
	}
}

// finish removes the run from the active-engines map and tears down its job-lifecycle
// adapter (unsubscribing it from the event bus) once execution ends.
func (m *WorkflowManager) finish(runID string) {
	m.mu.Lock()
	delete(m.engines, runID)
	cleanup := m.cleanups[runID]
	delete(m.cleanups, runID)
	m.mu.Unlock()
	if cleanup != nil {
		cleanup()
	}
}

// persist writes a run record, logging (not failing) a store error, since a transition
// write failure must not crash a live run.
func (m *WorkflowManager) persist(run *WorkflowRun) {
	if err := m.store.Save(run); err != nil {
		events.Events.Warn("workflow: persisting run %s: %s", run.RunID, err)
	}
}

// nextRunID returns a unique run id for this manager: a monotonic sequence combined with a
// nanosecond timestamp, so ids are unique within and across runs.
func (m *WorkflowManager) nextRunID() string {
	m.mu.Lock()
	m.seq++
	seq := m.seq
	m.mu.Unlock()
	return "wfr-" + strconv.FormatInt(time.Now().UnixNano(), 10) + "-" + strconv.FormatUint(seq, 10)
}

// stampRunTimestamps sets Started on first RUNNING and Completed on a terminal status.
func stampRunTimestamps(run *WorkflowRun, status RunStatus) {
	if status == RunRunning && run.Started.IsZero() {
		run.Started = time.Now()
	}
	if status.Terminal() {
		run.Completed = time.Now()
	}
}
