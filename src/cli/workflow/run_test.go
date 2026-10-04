package workflow

import (
	"testing"
)

// steps builds a step slice from id->continueOnError pairs for derivation tests.
func contSteps(spec ...struct {
	id   string
	cont bool
},
) []Step {
	out := make([]Step, 0, len(spec))
	for _, s := range spec {
		out = append(out, Step{ID: s.id, Type: StepSleep, ContinueOnError: s.cont})
	}
	return out
}

func TestDeriveRunStatus(t *testing.T) {
	type pair = struct {
		id   string
		cont bool
	}
	cases := []struct {
		name     string
		steps    []Step
		statuses map[string]StepStatus
		want     RunStatus
	}{
		{
			name:     "all pending -> running (reachable)",
			steps:    contSteps(pair{"a", false}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepPending, "b": StepPending},
			want:     RunRunning,
		},
		{
			name:     "one running -> running",
			steps:    contSteps(pair{"a", false}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepSucceeded, "b": StepRunning},
			want:     RunRunning,
		},
		{
			name:     "pending remaining while others done -> running",
			steps:    contSteps(pair{"a", false}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepSucceeded, "b": StepPending},
			want:     RunRunning,
		},
		{
			name:     "all succeeded -> succeeded",
			steps:    contSteps(pair{"a", false}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepSucceeded, "b": StepSucceeded},
			want:     RunSucceeded,
		},
		{
			name:     "failed without continueOnError -> failed",
			steps:    contSteps(pair{"a", false}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepFailed, "b": StepSkipped},
			want:     RunFailed,
		},
		{
			name:     "failed WITH continueOnError, rest succeeded -> succeeded",
			steps:    contSteps(pair{"a", true}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepFailed, "b": StepSucceeded},
			want:     RunSucceeded,
		},
		{
			name:     "succeeded and skipped (continueOnError) -> succeeded",
			steps:    contSteps(pair{"a", true}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepSkipped, "b": StepSucceeded},
			want:     RunSucceeded,
		},
		{
			name:     "running wins over a failed sibling (still in flight)",
			steps:    contSteps(pair{"a", false}, pair{"b", false}),
			statuses: map[string]StepStatus{"a": StepFailed, "b": StepRunning},
			want:     RunRunning,
		},
		{
			name:     "empty run -> succeeded (vacuous)",
			steps:    nil,
			statuses: map[string]StepStatus{},
			want:     RunSucceeded,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := DeriveRunStatus(tc.steps, tc.statuses); got != tc.want {
				t.Errorf("DeriveRunStatus = %s, want %s", got, tc.want)
			}
		})
	}
}

func TestNewWorkflowRun(t *testing.T) {
	doc := Document{
		Metadata: &Metadata{Name: "nightly"},
		Spec: Spec{Steps: []Step{
			{ID: "a", Name: "Step A", Type: StepJob},
			{ID: "b", Type: StepSleep, DependsOn: []string{"a"}},
		}},
	}
	run := NewWorkflowRun("run-123", doc)
	if run.RunID != "run-123" {
		t.Errorf("RunID = %q", run.RunID)
	}
	if run.Name != "nightly" {
		t.Errorf("Name = %q", run.Name)
	}
	if run.Status != RunPending {
		t.Errorf("Status = %s, want PENDING", run.Status)
	}
	if len(run.Steps) != 2 {
		t.Fatalf("Steps len = %d, want 2", len(run.Steps))
	}
	if run.Steps[0].StepID != "a" || run.Steps[0].Name != "Step A" || run.Steps[0].Type != string(StepJob) {
		t.Errorf("step[0] = %+v", run.Steps[0])
	}
	if run.Steps[0].Status != StepPending || run.Steps[1].Status != StepPending {
		t.Error("all steps should start PENDING")
	}
	if run.Created.IsZero() {
		t.Error("Created should be set")
	}
}

func TestNewWorkflowRunNoMetadata(t *testing.T) {
	// A document without metadata yields an empty run name, not a nil-deref.
	run := NewWorkflowRun("r", Document{Spec: Spec{Steps: []Step{{ID: "a", Type: StepSleep}}}})
	if run.Name != "" {
		t.Errorf("Name = %q, want empty", run.Name)
	}
}

func TestWorkflowRunStepStatuses(t *testing.T) {
	run := NewWorkflowRun("r", Document{Spec: Spec{Steps: []Step{
		{ID: "a", Type: StepSleep},
		{ID: "b", Type: StepSleep},
	}}})
	run.Steps[0].Status = StepSucceeded
	run.Steps[1].Status = StepRunning
	got := run.StepStatuses()
	if got["a"] != StepSucceeded || got["b"] != StepRunning {
		t.Errorf("StepStatuses = %v", got)
	}
}
