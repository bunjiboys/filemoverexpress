package workflow

import "testing"

func TestReconcileRunStatus(t *testing.T) {
	cases := []struct {
		in      RunStatus
		want    RunStatus
		changed bool
	}{
		{RunPending, RunFailed, true},
		{RunRunning, RunFailed, true},
		{RunPaused, RunFailed, true},
		{RunSucceeded, RunSucceeded, false},
		{RunFailed, RunFailed, false},
		{RunCancelled, RunCancelled, false},
	}
	for _, tc := range cases {
		t.Run(string(tc.in), func(t *testing.T) {
			got, changed := reconcileRunStatus(tc.in)
			if got != tc.want || changed != tc.changed {
				t.Errorf("reconcileRunStatus(%s) = (%s, %v), want (%s, %v)", tc.in, got, changed, tc.want, tc.changed)
			}
		})
	}
}

func TestReconcileRunInterrupted(t *testing.T) {
	run := &WorkflowRun{
		RunID:  "r",
		Status: RunRunning,
		Steps: []WorkflowStep{
			{StepID: "a", Status: StepSucceeded}, // terminal, untouched
			{StepID: "b", Status: StepRunning},   // was running -> FAILED
			{StepID: "c", Status: StepPending},   // not started -> SKIPPED
			{StepID: "d", Status: StepSkipped},   // terminal, untouched
			{StepID: "e", Status: StepFailed},    // terminal, untouched
		},
	}
	changed := ReconcileRun(run)
	if !changed {
		t.Fatal("expected the interrupted run to be changed")
	}
	if run.Status != RunFailed {
		t.Errorf("run status = %s, want FAILED", run.Status)
	}
	want := map[string]StepStatus{
		"a": StepSucceeded,
		"b": StepFailed,
		"c": StepSkipped,
		"d": StepSkipped,
		"e": StepFailed,
	}
	for _, s := range run.Steps {
		if s.Status != want[s.StepID] {
			t.Errorf("step %s = %s, want %s", s.StepID, s.Status, want[s.StepID])
		}
	}
}

func TestReconcileRunTerminalUnchanged(t *testing.T) {
	run := &WorkflowRun{
		RunID:  "r",
		Status: RunSucceeded,
		Steps: []WorkflowStep{
			{StepID: "a", Status: StepSucceeded},
			{StepID: "b", Status: StepPending}, // stays as-is: run is terminal, not reconciled
		},
	}
	changed := ReconcileRun(run)
	if changed {
		t.Error("a terminal run should not be changed")
	}
	if run.Status != RunSucceeded {
		t.Errorf("run status = %s, want SUCCEEDED (unchanged)", run.Status)
	}
	if run.Steps[1].Status != StepPending {
		t.Error("steps of a terminal run must not be rewritten")
	}
}

func TestReconcileAllRuns(t *testing.T) {
	runs := []*WorkflowRun{
		{RunID: "a", Status: RunRunning, Steps: []WorkflowStep{{StepID: "s", Status: StepRunning}}},
		{RunID: "b", Status: RunSucceeded},
		{RunID: "c", Status: RunPending},
	}
	changed := ReconcileAll(runs)
	if len(changed) != 2 {
		t.Fatalf("changed count = %d, want 2 (a and c)", len(changed))
	}
	for _, r := range changed {
		if r.Status != RunFailed {
			t.Errorf("reconciled run %s = %s, want FAILED", r.RunID, r.Status)
		}
	}
}
