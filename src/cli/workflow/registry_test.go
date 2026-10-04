package workflow

import (
	"context"
	"errors"
	"testing"
)

type stubExec struct {
	called bool
	err    error
}

func (s *stubExec) Execute(_ context.Context, _ Step) error {
	s.called = true
	return s.err
}

func TestRegistryDispatch(t *testing.T) {
	sleep := &stubExec{}
	job := &stubExec{err: errors.New("boom")}
	reg := Registry{StepSleep: sleep, StepJob: job}

	if err := reg.Execute(context.Background(), Step{ID: "a", Type: StepSleep}); err != nil {
		t.Fatalf("sleep dispatch err = %v", err)
	}
	if !sleep.called {
		t.Error("sleep executor not called")
	}
	if err := reg.Execute(context.Background(), Step{ID: "b", Type: StepJob}); err == nil {
		t.Error("expected job error to propagate")
	}
	if !job.called {
		t.Error("job executor not called")
	}
}

func TestRegistryUnknownType(t *testing.T) {
	reg := Registry{}
	err := reg.Execute(context.Background(), Step{ID: "a", Type: StepType("Teleport")})
	if err == nil {
		t.Fatal("expected an error for an unregistered step type")
	}
}

func TestNewDefaultRegistryWiresAllTypes(t *testing.T) {
	reg := NewDefaultRegistry()
	for _, typ := range []StepType{StepJob, StepChecksum, StepSleep, StepInventoryReport} {
		if reg[typ] == nil {
			t.Errorf("NewDefaultRegistry missing executor for %q", typ)
		}
	}
	if len(reg) != 4 {
		t.Errorf("registry has %d entries, want 4", len(reg))
	}
}

func TestWithString(t *testing.T) {
	with := map[string]any{"s": "hello", "n": float64(3), "b": true}
	if got := withString(with, "s"); got != "hello" {
		t.Errorf("withString(s) = %q", got)
	}
	if got := withString(with, "missing"); got != "" {
		t.Errorf("withString(missing) = %q, want empty", got)
	}
	if got := withString(with, "n"); got != "" {
		t.Errorf("withString(n) = %q, want empty for non-string", got)
	}
}

func TestWithBool(t *testing.T) {
	with := map[string]any{"t": true, "f": false, "s": "true"}
	if !withBool(with, "t", false) {
		t.Error("withBool(t) = false, want true")
	}
	if withBool(with, "f", true) {
		t.Error("withBool(f) = true, want false")
	}
	if !withBool(with, "missing", true) {
		t.Error("withBool(missing) should return the default true")
	}
	if withBool(with, "s", false) {
		t.Error("withBool(s) non-bool should return the default")
	}
}

func TestWithStringSlice(t *testing.T) {
	with := map[string]any{
		"ok":    []any{"/a", "/b"},
		"mixed": []any{"/a", float64(3)},
		"notls": "x",
	}
	got := withStringSlice(with, "ok")
	if len(got) != 2 || got[0] != "/a" || got[1] != "/b" {
		t.Errorf("withStringSlice(ok) = %v", got)
	}
	if got := withStringSlice(with, "missing"); got != nil {
		t.Errorf("withStringSlice(missing) = %v, want nil", got)
	}
	// a non-string element is dropped.
	if got := withStringSlice(with, "mixed"); len(got) != 1 || got[0] != "/a" {
		t.Errorf("withStringSlice(mixed) = %v, want [/a]", got)
	}
	if got := withStringSlice(with, "notls"); got != nil {
		t.Errorf("withStringSlice(notls) = %v, want nil", got)
	}
}
