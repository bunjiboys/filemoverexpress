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

		mu      sync.Mutex
		engines map[string]*Engine // active runs, by run id, for lifecycle operations
		seq     uint64
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
	}
}

// Start parses and validates a submitted document; on any validation failure it returns
// the failures and an empty run id without creating a run. On acceptance it creates a run
// record, persists it, launches execution in the background, and returns the run id. A
// non-nil error is reserved for an unexpected internal failure (e.g. the initial store
// write); a parse failure or any content problem is a validation error, not an error.
func (m *WorkflowManager) Start(src []byte, format Format, params map[string]string) (string, []ValidationError, error) {
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

// launch builds an engine for the run, wires transition-only persistence and run tracking,
// and executes the document in a background goroutine.
func (m *WorkflowManager) launch(run *WorkflowRun, doc Document) {
	engine := NewEngine(m.registry, m.maxActive)
	engine.OnStepStatus = m.onStepStatus(run.RunID)
	engine.OnRunStatus = m.onRunStatus(run.RunID)

	m.mu.Lock()
	m.engines[run.RunID] = engine
	m.mu.Unlock()

	go func() {
		engine.Run(context.Background(), doc)
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

// finish removes the run from the active-engines map once execution ends.
func (m *WorkflowManager) finish(runID string) {
	m.mu.Lock()
	delete(m.engines, runID)
	m.mu.Unlock()
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
