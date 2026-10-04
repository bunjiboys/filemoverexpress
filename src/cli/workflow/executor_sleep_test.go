package workflow

import (
	"context"
	"testing"
	"time"
)

func TestSleepExecutorCompletes(t *testing.T) {
	exec := &SleepExecutor{}
	step := Step{ID: "s", Type: StepSleep, With: map[string]any{"duration": "1ms"}}
	if err := exec.Execute(context.Background(), step); err != nil {
		t.Fatalf("Execute err = %v", err)
	}
}

func TestSleepExecutorBadDuration(t *testing.T) {
	exec := &SleepExecutor{}
	step := Step{ID: "s", Type: StepSleep, With: map[string]any{"duration": "not-a-duration"}}
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected an error for an unparseable duration")
	}
}

func TestSleepExecutorMissingDuration(t *testing.T) {
	exec := &SleepExecutor{}
	step := Step{ID: "s", Type: StepSleep, With: map[string]any{}}
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected an error for a missing duration")
	}
}

func TestSleepExecutorNonPositive(t *testing.T) {
	exec := &SleepExecutor{}
	step := Step{ID: "s", Type: StepSleep, With: map[string]any{"duration": "0s"}}
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected an error for a non-positive duration")
	}
}

func TestSleepExecutorCancelled(t *testing.T) {
	exec := &SleepExecutor{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled
	step := Step{ID: "s", Type: StepSleep, With: map[string]any{"duration": "10s"}}
	start := time.Now()
	err := exec.Execute(ctx, step)
	if err == nil {
		t.Fatal("expected a cancellation error")
	}
	if time.Since(start) > time.Second {
		t.Error("Execute did not return promptly on a cancelled context")
	}
}
