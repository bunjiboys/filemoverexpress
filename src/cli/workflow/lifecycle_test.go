package workflow

import (
	"context"
	"sync"
	"testing"
	"time"
)

// gatingExecutor blocks each step until the test releases it, so lifecycle operations can
// act on a deterministic in-flight state. It also records which steps started.
type gatingExecutor struct {
	mu      sync.Mutex
	started map[string]bool
	release map[string]chan struct{}
}

func newGatingExecutor(ids ...string) *gatingExecutor {
	g := &gatingExecutor{started: map[string]bool{}, release: map[string]chan struct{}{}}
	for _, id := range ids {
		g.release[id] = make(chan struct{})
	}
	return g
}

func (g *gatingExecutor) Execute(ctx context.Context, step Step) error {
	g.mu.Lock()
	g.started[step.ID] = true
	ch := g.release[step.ID]
	g.mu.Unlock()
	if ch == nil {
		return nil
	}
	select {
	case <-ch:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (g *gatingExecutor) didStart(id string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.started[id]
}

// fakeLifecycle records the job-lifecycle cascade calls the engine makes, keyed by step id.
type fakeLifecycle struct {
	mu        sync.Mutex
	cancelled []string
	paused    []string
	resumed   []string
}

func (f *fakeLifecycle) Cancel(stepID string) { f.mu.Lock(); f.cancelled = append(f.cancelled, stepID); f.mu.Unlock() }
func (f *fakeLifecycle) Pause(stepID string)  { f.mu.Lock(); f.paused = append(f.paused, stepID); f.mu.Unlock() }
func (f *fakeLifecycle) Resume(stepID string) { f.mu.Lock(); f.resumed = append(f.resumed, stepID); f.mu.Unlock() }

func (f *fakeLifecycle) snapshot() ([]string, []string, []string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string{}, f.cancelled...), append([]string{}, f.paused...), append([]string{}, f.resumed...)
}

// waitFor polls cond until true or the deadline, failing the test on timeout.
func waitFor(t *testing.T, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for: %s", msg)
}

func TestEngineCancelRunSkipsPendingAndCascades(t *testing.T) {
	// a (running, gated) -> b (pending). Cancel while a is in flight: a's job is
	// cancelled, b is skipped, run is CANCELLED.
	exec := newGatingExecutor("a")
	life := &fakeLifecycle{}
	eng := NewEngine(exec, 4)
	eng.Jobs = life
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepJob},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
	}}}

	var result RunResult
	done := make(chan struct{})
	go func() { result = eng.Run(context.Background(), doc); close(done) }()

	waitFor(t, func() bool { return exec.didStart("a") }, "step a to start")
	eng.CancelRun()
	// Release a so it can observe cancellation and finish.
	close(exec.release["a"])
	<-done

	if result.Status != RunCancelled {
		t.Fatalf("run status = %s, want CANCELLED", result.Status)
	}
	if result.Steps["b"] != StepSkipped {
		t.Errorf("b = %s, want SKIPPED", result.Steps["b"])
	}
	if exec.didStart("b") {
		t.Error("b should never have started after cancel")
	}
	cancelled, _, _ := life.snapshot()
	if len(cancelled) != 1 || cancelled[0] != "a" {
		t.Errorf("job cancel cascade = %v, want [a]", cancelled)
	}
}

func TestEnginePauseGatesSchedulerAndResume(t *testing.T) {
	// a (gated) completes while paused; b must NOT start until resume.
	exec := newGatingExecutor("a", "b")
	eng := NewEngine(exec, 4)
	doc := Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
	}}}

	done := make(chan struct{})
	var result RunResult
	go func() { result = eng.Run(context.Background(), doc); close(done) }()

	waitFor(t, func() bool { return exec.didStart("a") }, "step a to start")
	eng.PauseRun(false)
	close(exec.release["a"]) // a finishes while paused

	// Give the scheduler a moment; b must still not have started.
	time.Sleep(20 * time.Millisecond)
	if exec.didStart("b") {
		t.Fatal("b started while the run was paused")
	}

	eng.ResumeRun()
	waitFor(t, func() bool { return exec.didStart("b") }, "step b to start after resume")
	close(exec.release["b"])
	<-done
	if result.Status != RunSucceeded {
		t.Errorf("run status = %s, want SUCCEEDED", result.Status)
	}
}

func TestEnginePauseInFlightJobsCascades(t *testing.T) {
	exec := newGatingExecutor("a")
	life := &fakeLifecycle{}
	eng := NewEngine(exec, 4)
	eng.Jobs = life
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepJob}}}}

	done := make(chan struct{})
	go func() { eng.Run(context.Background(), doc); close(done) }()

	waitFor(t, func() bool { return exec.didStart("a") }, "step a to start")
	eng.PauseRun(true) // pause in-flight jobs too
	waitFor(t, func() bool { _, paused, _ := life.snapshot(); return len(paused) == 1 }, "job pause cascade")
	_, paused, _ := life.snapshot()
	if paused[0] != "a" {
		t.Errorf("job pause cascade = %v, want [a]", paused)
	}

	eng.ResumeRun()
	waitFor(t, func() bool { _, _, resumed := life.snapshot(); return len(resumed) == 1 }, "job resume cascade")
	close(exec.release["a"])
	<-done
}

func TestEnginePauseWithoutInFlightJobsDoesNotCascade(t *testing.T) {
	exec := newGatingExecutor("a")
	life := &fakeLifecycle{}
	eng := NewEngine(exec, 4)
	eng.Jobs = life
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepJob}}}}

	done := make(chan struct{})
	go func() { eng.Run(context.Background(), doc); close(done) }()
	waitFor(t, func() bool { return exec.didStart("a") }, "step a to start")
	eng.PauseRun(false)
	time.Sleep(20 * time.Millisecond)
	_, paused, _ := life.snapshot()
	if len(paused) != 0 {
		t.Errorf("no job pause expected with pauseInFlightJobs=false, got %v", paused)
	}
	eng.ResumeRun()
	close(exec.release["a"])
	<-done
}

func TestEngineRunStatusObserver(t *testing.T) {
	exec := newGatingExecutor() // no gating; runs immediately
	eng := NewEngine(exec, 4)
	var mu sync.Mutex
	var seen []RunStatus
	eng.OnRunStatus = func(s RunStatus) { mu.Lock(); seen = append(seen, s); mu.Unlock() }
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepSleep}}}}
	eng.Run(context.Background(), doc)
	mu.Lock()
	defer mu.Unlock()
	if len(seen) < 2 || seen[0] != RunRunning || seen[len(seen)-1] != RunSucceeded {
		t.Errorf("run status transitions = %v, want RUNNING ... SUCCEEDED", seen)
	}
}

func TestEngineLifecycleNoopsWithoutActiveRun(t *testing.T) {
	// Calling lifecycle methods with no active run must not panic or block.
	eng := NewEngine(newGatingExecutor(), 4)
	eng.CancelRun()
	eng.PauseRun(true)
	eng.ResumeRun()
}

func TestEnginePausedSingleStepFinishesAndExits(t *testing.T) {
	// Pause a one-step run, then let the gated step finish while paused. With nothing
	// pending and nothing running, the loop must exit (hasUnfinished false) as SUCCEEDED,
	// without waiting for a resume.
	exec := newGatingExecutor("a")
	eng := NewEngine(exec, 4)
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepSleep}}}}

	done := make(chan struct{})
	var result RunResult
	go func() { result = eng.Run(context.Background(), doc); close(done) }()

	waitFor(t, func() bool { return exec.didStart("a") }, "step a to start")
	eng.PauseRun(false)
	close(exec.release["a"]) // a finishes while paused; it is the only step
	<-done
	if result.Status != RunSucceeded {
		t.Errorf("run status = %s, want SUCCEEDED", result.Status)
	}
}

func TestEngineCancelIdempotentAfterTerminal(t *testing.T) {
	exec := newGatingExecutor() // completes immediately
	eng := NewEngine(exec, 4)
	doc := Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepSleep}}}}
	result := eng.Run(context.Background(), doc)
	if result.Status != RunSucceeded {
		t.Fatalf("run status = %s, want SUCCEEDED", result.Status)
	}
	// Cancel after the run finished is a no-op.
	eng.CancelRun()
}
