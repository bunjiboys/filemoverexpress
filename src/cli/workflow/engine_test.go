package workflow

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
)

// fakeExecutor is a test StepExecutor. It records the order steps start in, enforces a
// per-step outcome, and can report the peak concurrency it observed. No real side
// effects: this is the seam the plan calls for (test the driver, not the transfers).
type fakeExecutor struct {
	mu       sync.Mutex
	started  []string
	fail     map[string]error // step id -> error to return (nil/absent = success)
	active   int32
	peak     int32
	onStart  func(id string) // optional hook invoked when a step begins, before it returns
	gateCtx  bool            // when true, a "wait" step blocks on ctx and returns ctx.Err()
}

func (f *fakeExecutor) Execute(ctx context.Context, step Step) error {
	n := atomic.AddInt32(&f.active, 1)
	for {
		p := atomic.LoadInt32(&f.peak)
		if n <= p || atomic.CompareAndSwapInt32(&f.peak, p, n) {
			break
		}
	}
	defer atomic.AddInt32(&f.active, -1)

	f.mu.Lock()
	f.started = append(f.started, step.ID)
	f.mu.Unlock()

	if f.onStart != nil {
		f.onStart(step.ID)
	}
	if f.gateCtx && step.ID == "wait" {
		<-ctx.Done()
		return ctx.Err()
	}
	if f.fail != nil {
		if err, ok := f.fail[step.ID]; ok {
			return err
		}
	}
	return nil
}

func newEngine(exec StepExecutor, maxActive int) *Engine {
	return NewEngine(exec, maxActive)
}

func TestEngineRunsLinearInOrder(t *testing.T) {
	exec := &fakeExecutor{}
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
		{ID: "c", Type: StepSleep, DependsOn: []string{"b"}},
	}}}
	result := newEngine(exec, 4).Run(context.Background(), doc)
	if result.Status != RunSucceeded {
		t.Fatalf("status = %s, want SUCCEEDED (steps: %+v)", result.Status, result.Steps)
	}
	want := []string{"a", "b", "c"}
	if !equalSlice(exec.started, want) {
		t.Errorf("start order = %v, want %v", exec.started, want)
	}
	for _, id := range want {
		if result.Steps[id] != StepSucceeded {
			t.Errorf("step %s = %s, want SUCCEEDED", id, result.Steps[id])
		}
	}
}

func TestEngineConcurrencyRespectsLimit(t *testing.T) {
	exec := &fakeExecutor{}
	// a fans out to b, c, d; with limit 2 at most 2 run at once.
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
		{ID: "c", Type: StepSleep, DependsOn: []string{"a"}},
		{ID: "d", Type: StepSleep, DependsOn: []string{"a"}},
	}}}
	result := newEngine(exec, 2).Run(context.Background(), doc)
	if result.Status != RunSucceeded {
		t.Fatalf("status = %s, want SUCCEEDED", result.Status)
	}
	if exec.peak > 2 {
		t.Errorf("peak concurrency = %d, want <= 2", exec.peak)
	}
}

func TestEngineMaxActiveFloor(t *testing.T) {
	// A non-positive limit is floored to 1 (serial) rather than deadlocking.
	exec := &fakeExecutor{}
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepSleep}}}}
	result := newEngine(exec, 0).Run(context.Background(), doc)
	if result.Status != RunSucceeded {
		t.Fatalf("status = %s, want SUCCEEDED", result.Status)
	}
	if exec.peak != 1 {
		t.Errorf("peak = %d, want 1", exec.peak)
	}
}

func TestEngineFailureSkipsTransitiveDependents(t *testing.T) {
	// Diamond: fail c (no continueOnError) -> e is skipped; d still runs.
	exec := &fakeExecutor{fail: map[string]error{"c": errors.New("boom")}}
	result := newEngine(exec, 4).Run(context.Background(), Document{Spec: Spec{Steps: diamond()}})
	if result.Status != RunFailed {
		t.Fatalf("status = %s, want FAILED", result.Status)
	}
	if result.Steps["c"] != StepFailed {
		t.Errorf("c = %s, want FAILED", result.Steps["c"])
	}
	if result.Steps["e"] != StepSkipped {
		t.Errorf("e = %s, want SKIPPED", result.Steps["e"])
	}
	if result.Steps["d"] != StepSucceeded {
		t.Errorf("d = %s, want SUCCEEDED (independent branch continues)", result.Steps["d"])
	}
	if contains(exec.started, "e") {
		t.Errorf("e should never have started, started=%v", exec.started)
	}
}

func TestEngineContinueOnErrorDoesNotSkip(t *testing.T) {
	// c fails but is continueOnError: e still runs, run SUCCEEDS.
	steps := diamond()
	for i := range steps {
		if steps[i].ID == "c" {
			steps[i].ContinueOnError = true
		}
	}
	exec := &fakeExecutor{fail: map[string]error{"c": errors.New("boom")}}
	result := newEngine(exec, 4).Run(context.Background(), Document{Spec: Spec{Steps: steps}})
	if result.Status != RunSucceeded {
		t.Fatalf("status = %s, want SUCCEEDED (continueOnError)", result.Status)
	}
	if result.Steps["e"] != StepSucceeded {
		t.Errorf("e = %s, want SUCCEEDED", result.Steps["e"])
	}
}

func TestEngineCycleIsFailedRun(t *testing.T) {
	// An unvalidated cyclic document cannot be scheduled: the run is FAILED, nothing runs.
	exec := &fakeExecutor{}
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep, DependsOn: []string{"b"}},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
	}}}
	result := newEngine(exec, 4).Run(context.Background(), doc)
	if result.Status != RunFailed {
		t.Fatalf("status = %s, want FAILED", result.Status)
	}
	if len(exec.started) != 0 {
		t.Errorf("no step should start on a cyclic graph, started=%v", exec.started)
	}
}

func TestEngineCancellationSkipsPending(t *testing.T) {
	// b blocks on ctx; cancelling mid-run makes b fail (ctx) and c (dependent) skip.
	exec := &fakeExecutor{gateCtx: true}
	ctx, cancel := context.WithCancel(context.Background())
	exec.onStart = func(id string) {
		if id == "wait" {
			cancel()
		}
	}
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "wait", Type: StepSleep},
		{ID: "c", Type: StepSleep, DependsOn: []string{"wait"}},
	}}}
	result := newEngine(exec, 4).Run(ctx, doc)
	if result.Status != RunFailed {
		t.Fatalf("status = %s, want FAILED after cancel", result.Status)
	}
	if result.Steps["c"] != StepSkipped {
		t.Errorf("c = %s, want SKIPPED", result.Steps["c"])
	}
}

func TestEngineEmptyDocument(t *testing.T) {
	// No steps: a vacuously-succeeded run.
	result := newEngine(&fakeExecutor{}, 4).Run(context.Background(), Document{})
	if result.Status != RunSucceeded {
		t.Fatalf("status = %s, want SUCCEEDED for an empty run", result.Status)
	}
}

func TestEngineStepStatusObserver(t *testing.T) {
	// The optional observer sees every step transition.
	var mu sync.Mutex
	seen := map[string][]StepStatus{}
	exec := &fakeExecutor{}
	eng := NewEngine(exec, 4)
	eng.OnStepStatus = func(id string, status StepStatus) {
		mu.Lock()
		seen[id] = append(seen[id], status)
		mu.Unlock()
	}
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepSleep}}}}
	eng.Run(context.Background(), doc)
	if got := seen["a"]; len(got) != 2 || got[0] != StepRunning || got[1] != StepSucceeded {
		t.Errorf("a transitions = %v, want [RUNNING SUCCEEDED]", got)
	}
}

func equalSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
