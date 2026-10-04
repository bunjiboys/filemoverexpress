package workflow

import "testing"

func TestRunStatusTerminal(t *testing.T) {
	cases := map[RunStatus]bool{
		RunPending:   false,
		RunRunning:   false,
		RunPaused:    false,
		RunSucceeded: true,
		RunFailed:    true,
		RunCancelled: true,
	}
	for status, want := range cases {
		if got := status.Terminal(); got != want {
			t.Errorf("RunStatus(%q).Terminal() = %v, want %v", status, got, want)
		}
	}
}

func TestStepStatusTerminal(t *testing.T) {
	cases := map[StepStatus]bool{
		StepPending:   false,
		StepRunning:   false,
		StepSucceeded: true,
		StepFailed:    true,
		StepSkipped:   true,
	}
	for status, want := range cases {
		if got := status.Terminal(); got != want {
			t.Errorf("StepStatus(%q).Terminal() = %v, want %v", status, got, want)
		}
	}
}

func TestDocumentIdentityConstants(t *testing.T) {
	if APIVersion != "fme.dev/workflow/v1" {
		t.Errorf("APIVersion = %q", APIVersion)
	}
	if Kind != "Workflow" {
		t.Errorf("Kind = %q", Kind)
	}
}
