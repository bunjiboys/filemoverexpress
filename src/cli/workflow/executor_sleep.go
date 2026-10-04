package workflow

import (
	"context"
	"fmt"
	"time"
)

// SleepExecutor runs a Sleep step: it blocks for the step's `duration` (a Go
// time.ParseDuration string), interruptible by context cancellation (format doc "The
// Sleep step payload"). It has no external dependency, so it is fully testable with a
// short duration and a cancelled context.
type SleepExecutor struct{}

// Execute parses the duration and waits for it, returning early with the context error if
// the run is cancelled first. A missing, unparseable, or non-positive duration is an
// error (the schema rejects these too; the executor guards defensively).
func (*SleepExecutor) Execute(ctx context.Context, step Step) error {
	raw := withString(step.With, "duration")
	if raw == "" {
		return fmt.Errorf("workflow: sleep step %s has no duration", step.ID)
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return fmt.Errorf("workflow: sleep step %s has an invalid duration %q: %w", step.ID, raw, err)
	}
	if d <= 0 {
		return fmt.Errorf("workflow: sleep step %s has a non-positive duration %q", step.ID, raw)
	}

	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
