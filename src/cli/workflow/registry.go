package workflow

import (
	"context"
	"fmt"

	"github.com/awslabs/filemoverexpress/types/transfertypes"
)

// Registry maps a step type to its executor. It implements StepExecutor itself by
// dispatching on the step's Type, so the engine holds a single StepExecutor and never
// knows about concrete step types (format doc "Generic typing": the engine dispatches on
// type to the registered executor). Phase E registers the four v1 executors; the map is
// open for later types.
type Registry map[StepType]StepExecutor

// NewDefaultRegistry wires the v1 executors (Upload, Download, Checksum, Sleep,
// InventoryReport) to their production implementations. Upload and Download share one
// JobExecutor implementation parameterized by direction; the direction is the step type,
// not an author-supplied field. The daemon passes the returned registry to the engine as
// its single StepExecutor.
func NewDefaultRegistry() Registry {
	return Registry{
		StepUpload:          NewJobExecutor(transfertypes.Upload),
		StepDownload:        NewJobExecutor(transfertypes.Download),
		StepChecksum:        NewChecksumExecutor(),
		StepSleep:           &SleepExecutor{},
		StepInventoryReport: NewInventoryExecutor(),
	}
}

// Execute dispatches a step to the executor registered for its type, returning an error
// for an unregistered type (which a schema-valid document cannot contain, but is guarded
// so a misconfigured registry fails loudly rather than silently skipping the step).
func (r Registry) Execute(ctx context.Context, step Step) error {
	exec, ok := r[step.Type]
	if !ok {
		return fmt.Errorf("workflow: no executor registered for step type %q", step.Type)
	}
	return exec.Execute(ctx, step)
}

// withString returns the string value at key in a `with` payload, or "" when the key is
// absent or not a string. Parameter substitution (Resolve) has already run, so a resolved
// value is a concrete Go type here.
func withString(with map[string]any, key string) string {
	s, _ := with[key].(string)
	return s
}

// withBool returns the bool value at key, or def when the key is absent or not a bool.
func withBool(with map[string]any, key string, def bool) bool {
	b, ok := with[key].(bool)
	if !ok {
		return def
	}
	return b
}

// withStringSlice returns the []string at key, dropping any non-string element, or nil
// when the key is absent or not a list.
func withStringSlice(with map[string]any, key string) []string {
	raw, ok := with[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
