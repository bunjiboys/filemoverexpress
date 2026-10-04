package workflow

import (
	"context"
	"sync"
	"testing"
	"time"
)

// singleGatedYAML is a one-step workflow (no parameters) whose step id is "sleep-step", so
// a gatingExecutor keyed on that id holds the run in flight for lifecycle tests.
const singleGatedYAML = `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: sleep-step
      type: Sleep
      with: {duration: 1s}
`

// memStore is an in-memory RunStore for manager tests (no bbolt).
type memStore struct {
	mu   sync.Mutex
	runs map[string]*WorkflowRun
}

func newMemStore() *memStore { return &memStore{runs: map[string]*WorkflowRun{}} }

func (m *memStore) Save(run *WorkflowRun) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *run
	m.runs[run.RunID] = &cp
	return nil
}

func (m *memStore) Load(runID string) (*WorkflowRun, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.runs[runID]
	if !ok {
		return nil, errNotFound
	}
	cp := *r
	return &cp, nil
}

func (m *memStore) List() ([]*WorkflowRun, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*WorkflowRun, 0, len(m.runs))
	for _, r := range m.runs {
		cp := *r
		out = append(out, &cp)
	}
	return out, nil
}

func (m *memStore) Delete(runID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.runs, runID)
	return nil
}

func (m *memStore) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.runs)
}

var errNotFound = &notFoundError{}

type notFoundError struct{}

func (*notFoundError) Error() string { return "not found" }

// instantExec is a StepExecutor that completes every step immediately.
type instantExec struct{}

func (instantExec) Execute(context.Context, Step) error { return nil }

// capturingExec records the `with` payload each step is handed, so a test can assert the
// executor receives resolved values (defaults merged, ${params.*} substituted) rather than
// the raw templated payload.
type capturingExec struct {
	mu   sync.Mutex
	with map[string]map[string]any
}

func newCapturingExec() *capturingExec { return &capturingExec{with: map[string]map[string]any{}} }

func (c *capturingExec) Execute(_ context.Context, step Step) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.with[step.ID] = step.With
	return nil
}

func (c *capturingExec) withFor(id string) map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.with[id]
}

func managerFor(store RunStore) *WorkflowManager {
	return NewWorkflowManager(store, Registry{StepSleep: instantExec{}, StepJob: instantExec{}}, 4, alwaysProfileOK)
}

// TestStartResolvesParamsBeforeExecution proves the engine runs RESOLVED steps: a Job step
// authored with sources: ["/mnt/${params.day}"] and destination "d/${params.day}" must
// reach the executor with those references substituted (day=15), not as literals. This
// guards the resolve-once-then-run path in Start.
func TestStartResolvesParamsBeforeExecution(t *testing.T) {
	store := newMemStore()
	cap := newCapturingExec()
	mgr := NewWorkflowManager(store, Registry{StepSleep: cap, StepJob: cap}, 4, alwaysProfileOK)

	_, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil {
		t.Fatalf("Start err = %v", err)
	}
	if len(verrs) != 0 {
		t.Fatalf("unexpected validation errors: %v", verrs)
	}

	// The run executes in a background goroutine; wait for step b to be captured.
	waitFor(t, func() bool { return cap.withFor("b") != nil }, "job step b to execute")

	got := cap.withFor("b")
	sources, _ := got["sources"].([]any)
	if len(sources) != 1 || sources[0] != "/mnt/15" {
		t.Errorf("sources = %#v, want [\"/mnt/15\"] (resolved, not templated)", got["sources"])
	}
	if got["destination"] != "d/15" {
		t.Errorf("destination = %#v, want \"d/15\" (resolved, not templated)", got["destination"])
	}
}

func TestWorkflowManagerStartAccepts(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	runID, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil {
		t.Fatalf("Start err = %v", err)
	}
	if len(verrs) != 0 {
		t.Fatalf("unexpected validation errors: %v", verrs)
	}
	if runID == "" {
		t.Fatal("expected a run id on acceptance")
	}
	// The run was persisted (at least the initial record).
	waitFor(t, func() bool { return store.count() == 1 }, "run persisted")
	// It reaches a terminal status.
	waitFor(t, func() bool {
		r, loadErr := store.Load(runID)
		return loadErr == nil && r.Status.Terminal()
	}, "run reaches terminal status")
}

func TestWorkflowManagerStartRejectsInvalid(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	// Missing required 'day' -> PARAMETER error, run rejected, nothing persisted.
	runID, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, ParamInputs{})
	if err != nil {
		t.Fatalf("Start err = %v", err)
	}
	if runID != "" {
		t.Errorf("rejected run should have no id, got %q", runID)
	}
	assertKind(t, verrs, KindParameter)
	time.Sleep(10 * time.Millisecond)
	if store.count() != 0 {
		t.Errorf("rejected run should not be persisted, store has %d", store.count())
	}
}

func TestWorkflowManagerStartParseError(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	_, verrs, err := mgr.Start([]byte("{not yaml: ["), FormatYAML, ParamInputs{})
	if err != nil {
		t.Fatalf("Start err = %v (a parse failure should be a validation error, not a hard error)", err)
	}
	assertKind(t, verrs, KindSchema)
}

func TestWorkflowManagerGet(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool {
		r, getErr := mgr.Get(runID)
		return getErr == nil && r != nil
	}, "run retrievable via Get")
	if _, getErr := mgr.Get("ghost"); getErr == nil {
		t.Error("Get of a missing run should error")
	}
}

func TestWorkflowManagerRunIDsUnique(t *testing.T) {
	mgr := managerFor(newMemStore())
	seen := map[string]bool{}
	for i := 0; i < 5; i++ {
		id, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
		if err != nil || id == "" {
			t.Fatalf("Start %d: id=%q err=%v", i, id, err)
		}
		if seen[id] {
			t.Fatalf("duplicate run id %q", id)
		}
		seen[id] = true
	}
}

// errStore fails Save (always) and Load (always), to exercise the manager's error paths.
type errStore struct{}

func (errStore) Save(*WorkflowRun) error           { return errNotFound }
func (errStore) Load(string) (*WorkflowRun, error) { return nil, errNotFound }
func (errStore) List() ([]*WorkflowRun, error)     { return nil, nil }
func (errStore) Delete(string) error               { return nil }

func TestWorkflowManagerStartSaveError(t *testing.T) {
	// The initial run-record Save failing is a hard error from Start (no run created).
	mgr := managerFor(errStore{})
	_, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err == nil {
		t.Fatal("expected a hard error when the initial Save fails")
	}
	if len(verrs) != 0 {
		t.Errorf("a store error is not a validation error, got %v", verrs)
	}
}

func TestWorkflowManagerTransitionLoadErrorsAreLogged(t *testing.T) {
	// With a store whose Load always fails, the step/run transition callbacks hit their
	// load-error branches. The run still completes without panicking.
	store := &loadErrStore{inner: newMemStore()}
	mgr := managerFor(store)
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil || runID == "" {
		t.Fatalf("Start: id=%q err=%v", runID, err)
	}
	// Let the background run churn through its transitions (all Load calls fail).
	time.Sleep(30 * time.Millisecond)
}

// loadErrStore saves normally but fails every Load, exercising the transition callbacks'
// load-error branches.
type loadErrStore struct{ inner *memStore }

func (s *loadErrStore) Save(r *WorkflowRun) error       { return s.inner.Save(r) }
func (*loadErrStore) Load(string) (*WorkflowRun, error) { return nil, errNotFound }
func (s *loadErrStore) List() ([]*WorkflowRun, error)   { return s.inner.List() }
func (s *loadErrStore) Delete(id string) error          { return s.inner.Delete(id) }

func TestWorkflowManagerPersistErrorIsLogged(t *testing.T) {
	// A store that accepts the first Save (the initial record) but fails subsequent ones
	// drives persist's error-log branch during transitions.
	store := &saveFailAfterFirst{inner: newMemStore()}
	mgr := managerFor(store)
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil || runID == "" {
		t.Fatalf("Start: id=%q err=%v", runID, err)
	}
	time.Sleep(30 * time.Millisecond)
}

// saveFailAfterFirst lets the initial record through, then fails every later Save.
type saveFailAfterFirst struct {
	inner  *memStore
	mu     sync.Mutex
	called bool
}

func (s *saveFailAfterFirst) Save(r *WorkflowRun) error {
	s.mu.Lock()
	first := !s.called
	s.called = true
	s.mu.Unlock()
	if first {
		return s.inner.Save(r)
	}
	return errNotFound
}
func (s *saveFailAfterFirst) Load(id string) (*WorkflowRun, error) { return s.inner.Load(id) }
func (s *saveFailAfterFirst) List() ([]*WorkflowRun, error)        { return s.inner.List() }
func (s *saveFailAfterFirst) Delete(id string) error               { return s.inner.Delete(id) }

// managerWithExec builds a manager whose Sleep and Job steps both run the given executor,
// so a gatingExecutor can hold a run in flight for lifecycle tests.
func managerWithExec(store RunStore, exec StepExecutor) *WorkflowManager {
	return NewWorkflowManager(store, Registry{StepSleep: exec, StepJob: exec}, 4, alwaysProfileOK)
}

func TestWorkflowManagerListReturnsPersistedRuns(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	id1, _, _ := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	id2, _, _ := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	waitFor(t, func() bool {
		runs, err := mgr.List()
		return err == nil && len(runs) == 2
	}, "both runs listed")
	runs, _ := mgr.List()
	ids := map[string]bool{}
	for _, r := range runs {
		ids[r.RunID] = true
	}
	if !ids[id1] || !ids[id2] {
		t.Fatalf("List missing a run: ids=%v want %s,%s", ids, id1, id2)
	}
}

func TestWorkflowManagerCancelActiveRun(t *testing.T) {
	store := newMemStore()
	exec := newGatingExecutor("sleep-step")
	mgr := managerWithExec(store, exec)
	runID, _, err := mgr.Start([]byte(singleGatedYAML), FormatYAML, ParamInputs{})
	if err != nil || runID == "" {
		t.Fatalf("Start: id=%q err=%v", runID, err)
	}
	// Wait until the step is in flight (the engine is tracked and active).
	waitFor(t, func() bool { return exec.didStart("sleep-step") }, "step started")

	if cancelErr := mgr.Cancel(runID); cancelErr != nil {
		t.Fatalf("Cancel active run: %v", cancelErr)
	}
	// Cancel does not force-kill an in-flight non-Job step; it finishes normally. Release
	// it so the scheduler drains and the run settles on its CANCELLED verdict.
	close(exec.release["sleep-step"])
	waitFor(t, func() bool {
		r, loadErr := store.Load(runID)
		return loadErr == nil && r.Status == RunCancelled
	}, "run reaches CANCELLED")
}

func TestWorkflowManagerPauseResumeActiveRun(t *testing.T) {
	store := newMemStore()
	exec := newGatingExecutor("sleep-step")
	mgr := managerWithExec(store, exec)
	runID, _, err := mgr.Start([]byte(singleGatedYAML), FormatYAML, ParamInputs{})
	if err != nil || runID == "" {
		t.Fatalf("Start: id=%q err=%v", runID, err)
	}
	waitFor(t, func() bool { return exec.didStart("sleep-step") }, "step started")

	if pauseErr := mgr.Pause(runID, false); pauseErr != nil {
		t.Fatalf("Pause active run: %v", pauseErr)
	}
	if resumeErr := mgr.Resume(runID); resumeErr != nil {
		t.Fatalf("Resume active run: %v", resumeErr)
	}
	// Release the step so the run can finish cleanly after resume.
	close(exec.release["sleep-step"])
	waitFor(t, func() bool {
		r, loadErr := store.Load(runID)
		return loadErr == nil && r.Status == RunSucceeded
	}, "run succeeds after resume")
}

func TestWorkflowManagerLifecycleUnknownRun(t *testing.T) {
	mgr := managerFor(newMemStore())
	if err := mgr.Cancel("ghost"); err == nil {
		t.Error("Cancel of unknown run should error")
	}
	if err := mgr.Pause("ghost", true); err == nil {
		t.Error("Pause of unknown run should error")
	}
	if err := mgr.Resume("ghost"); err == nil {
		t.Error("Resume of unknown run should error")
	}
}

func TestWorkflowManagerLifecycleTerminalRun(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil || runID == "" {
		t.Fatalf("Start: id=%q err=%v", runID, err)
	}
	// Let it finish; the engine is then removed from the active map.
	waitFor(t, func() bool {
		r, loadErr := store.Load(runID)
		return loadErr == nil && r.Status.Terminal()
	}, "run terminal")
	// A lifecycle op on a finished (but known) run errors as no-longer-active, not unknown.
	if cancelErr := mgr.Cancel(runID); cancelErr == nil {
		t.Error("Cancel of a terminal run should error (no active engine)")
	}
}

func TestWorkflowManagerGeneratesUniqueRunIDs(t *testing.T) {
	mgr := managerFor(newMemStore())
	seen := map[string]bool{}
	for i := 0; i < 5; i++ {
		id, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
		if err != nil || id == "" {
			t.Fatalf("Start %d: id=%q err=%v", i, id, err)
		}
		if seen[id] {
			t.Fatalf("duplicate run id %q", id)
		}
		seen[id] = true
	}
}

func TestWorkflowManagerJobLifecycleFactoryWiredAndCleaned(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	var (
		mu           sync.Mutex
		factoryRunID string
		cleaned      bool
	)
	mgr.JobLifecycleFactory = func(runID string) (JobLifecycle, func()) {
		mu.Lock()
		factoryRunID = runID
		mu.Unlock()
		return &fakeLifecycle{}, func() { mu.Lock(); cleaned = true; mu.Unlock() }
	}
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, ScalarInputs(map[string]string{"day": "15"}))
	if err != nil || runID == "" {
		t.Fatalf("Start: id=%q err=%v", runID, err)
	}
	// The factory was invoked with this run's id, and once the run finishes its cleanup
	// (bus unsubscribe) runs.
	waitFor(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return factoryRunID == runID && cleaned
	}, "factory wired for run and cleaned up on finish")
}

// listErrStore fails List, exercising Reconcile's list-error branch.
type listErrStore struct{ inner *memStore }

func (s *listErrStore) Save(r *WorkflowRun) error            { return s.inner.Save(r) }
func (s *listErrStore) Load(id string) (*WorkflowRun, error) { return s.inner.Load(id) }
func (*listErrStore) List() ([]*WorkflowRun, error)          { return nil, errNotFound }
func (s *listErrStore) Delete(id string) error               { return s.inner.Delete(id) }

func TestWorkflowManagerReconcileMarksInterruptedRuns(t *testing.T) {
	store := newMemStore()
	// Seed three persisted runs as if a prior daemon was interrupted: one RUNNING (with an
	// in-flight step), one already SUCCEEDED (terminal, must be untouched), one PENDING.
	seed := []*WorkflowRun{
		{RunID: "run-running", Status: RunRunning, Steps: []WorkflowStep{{StepID: "s", Status: StepRunning}}},
		{RunID: "run-done", Status: RunSucceeded, Steps: []WorkflowStep{{StepID: "s", Status: StepSucceeded}}},
		{RunID: "run-pending", Status: RunPending, Steps: []WorkflowStep{{StepID: "s", Status: StepPending}}},
	}
	for _, r := range seed {
		if err := store.Save(r); err != nil {
			t.Fatalf("seed save: %v", err)
		}
	}

	mgr := managerFor(store)
	n, err := mgr.Reconcile()
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if n != 2 {
		t.Fatalf("reconciled count = %d, want 2 (the running and pending runs)", n)
	}

	running, _ := store.Load("run-running")
	if running.Status != RunFailed || running.Steps[0].Status != StepFailed {
		t.Errorf("interrupted RUNNING run = (%s, step %s), want (FAILED, FAILED)", running.Status, running.Steps[0].Status)
	}
	pending, _ := store.Load("run-pending")
	if pending.Status != RunFailed || pending.Steps[0].Status != StepSkipped {
		t.Errorf("interrupted PENDING run = (%s, step %s), want (FAILED, SKIPPED)", pending.Status, pending.Steps[0].Status)
	}
	done, _ := store.Load("run-done")
	if done.Status != RunSucceeded || done.Steps[0].Status != StepSucceeded {
		t.Errorf("terminal run was rewritten: (%s, step %s)", done.Status, done.Steps[0].Status)
	}
}

func TestWorkflowManagerReconcileNoRuns(t *testing.T) {
	mgr := managerFor(newMemStore())
	n, err := mgr.Reconcile()
	if err != nil || n != 0 {
		t.Fatalf("Reconcile on empty store = (%d, %v), want (0, nil)", n, err)
	}
}

func TestWorkflowManagerReconcileListError(t *testing.T) {
	mgr := managerFor(&listErrStore{inner: newMemStore()})
	if _, err := mgr.Reconcile(); err == nil {
		t.Error("Reconcile should return an error when the store List fails")
	}
}

func TestWorkflowManagerReconcilePersistErrorIsNotFatal(t *testing.T) {
	// A store that lists an interrupted run but fails every Save: Reconcile logs the
	// per-record save failure and still reports it reconciled the record (count reflects
	// ReconcileAll's changed set, not the persistence outcome), without erroring out.
	inner := newMemStore()
	_ = inner.Save(&WorkflowRun{RunID: "r", Status: RunRunning, Steps: []WorkflowStep{{StepID: "s", Status: StepRunning}}})
	mgr := managerFor(&saveAlwaysFails{inner: inner})
	n, err := mgr.Reconcile()
	if err != nil {
		t.Fatalf("Reconcile must not fail on a per-record save error: %v", err)
	}
	if n != 1 {
		t.Fatalf("reconciled count = %d, want 1", n)
	}
}

// saveAlwaysFails lists from its inner store but fails every Save, so Reconcile's persist
// of a changed record hits the logged-not-fatal error path.
type saveAlwaysFails struct{ inner *memStore }

func (*saveAlwaysFails) Save(*WorkflowRun) error                { return errNotFound }
func (s *saveAlwaysFails) Load(id string) (*WorkflowRun, error) { return s.inner.Load(id) }
func (s *saveAlwaysFails) List() ([]*WorkflowRun, error)        { return s.inner.List() }
func (s *saveAlwaysFails) Delete(id string) error               { return s.inner.Delete(id) }
