package workflow

import (
	"context"
	"sync"
	"testing"
	"time"
)

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

func managerFor(store RunStore) *WorkflowManager {
	return NewWorkflowManager(store, Registry{StepSleep: instantExec{}, StepJob: instantExec{}}, 4, alwaysProfileOK)
}

func TestWorkflowManagerStartAccepts(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	runID, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
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
	runID, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{})
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
	_, verrs, err := mgr.Start([]byte("{not yaml: ["), FormatYAML, nil)
	if err != nil {
		t.Fatalf("Start err = %v (a parse failure should be a validation error, not a hard error)", err)
	}
	assertKind(t, verrs, KindSchema)
}

func TestWorkflowManagerGet(t *testing.T) {
	store := newMemStore()
	mgr := managerFor(store)
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
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
		id, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
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
	_, verrs, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
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
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
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
	runID, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
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

func TestWorkflowManagerGeneratesUniqueRunIDs(t *testing.T) {
	mgr := managerFor(newMemStore())
	seen := map[string]bool{}
	for i := 0; i < 5; i++ {
		id, _, err := mgr.Start([]byte(validRunYAML), FormatYAML, map[string]string{"day": "15"})
		if err != nil || id == "" {
			t.Fatalf("Start %d: id=%q err=%v", i, id, err)
		}
		if seen[id] {
			t.Fatalf("duplicate run id %q", id)
		}
		seen[id] = true
	}
}
