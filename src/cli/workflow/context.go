package workflow

import "context"

// runIDContextKey is the unexported context key under which a run's id is carried to the
// executors. It is unexported so no other package can set or collide with it.
type runIDContextKey struct{}

// WithRunID returns a context carrying the workflow run id. The manager sets it before
// executing a run so the Job executor can stamp workflow provenance (run id + step id)
// onto the jobs it creates, which the lifecycle adapter uses to resolve a step to its job.
func WithRunID(ctx context.Context, runID string) context.Context {
	return context.WithValue(ctx, runIDContextKey{}, runID)
}

// runIDFrom returns the run id carried on the context, or "" when none is set (e.g. a Job
// executor invoked outside a managed run, such as a unit test).
func runIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(runIDContextKey{}).(string)
	return id
}
