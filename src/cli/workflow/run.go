package workflow

import "time"

type (
	// WorkflowStep is one step's record within a run, mirroring the WorkflowStep protobuf
	// message (format doc "Run and step status model"). StepID is the design-time step id
	// (distinct from JobID, the runtime job a Job step creates). Error carries the failure
	// message when Status is FAILED.
	WorkflowStep struct {
		StepID string
		Name   string
		Type   string
		Status StepStatus
		JobID  string
		Error  string
	}

	// WorkflowRun is the live, stateful record the daemon owns from acceptance to a
	// terminal state, mirroring the WorkflowRun protobuf message. Status is derived from
	// the steps for the PENDING/RUNNING/SUCCEEDED/FAILED cases and set directly for PAUSED
	// and CANCELLED (format doc "Lifecycle operations"). The record is self-contained so
	// it maps 1:1 to one persisted store value.
	WorkflowRun struct {
		RunID     string
		Name      string
		Status    RunStatus
		Steps     []WorkflowStep
		Created   time.Time
		Started   time.Time
		Completed time.Time
	}
)

// NewWorkflowRun builds a run record for a document in the initial PENDING state, with a
// WorkflowStep per declared step (also PENDING) and the created timestamp set. A document
// without metadata yields an empty run name.
func NewWorkflowRun(runID string, doc Document) *WorkflowRun {
	name := ""
	if doc.Metadata != nil {
		name = doc.Metadata.Name
	}
	steps := make([]WorkflowStep, 0, len(doc.Spec.Steps))
	for i := range doc.Spec.Steps {
		s := doc.Spec.Steps[i]
		steps = append(steps, WorkflowStep{
			StepID: s.ID,
			Name:   s.Name,
			Type:   string(s.Type),
			Status: StepPending,
		})
	}
	return &WorkflowRun{
		RunID:   runID,
		Name:    name,
		Status:  RunPending,
		Steps:   steps,
		Created: time.Now(),
	}
}

// StepStatuses returns a map from step id to its current status, the shape DeriveRunStatus
// consumes.
func (r *WorkflowRun) StepStatuses() map[string]StepStatus {
	out := make(map[string]StepStatus, len(r.Steps))
	for i := range r.Steps {
		out[r.Steps[i].StepID] = r.Steps[i].Status
	}
	return out
}

// DeriveRunStatus computes a run's status from its step statuses (format doc "Run and step
// status model"). It covers only the derived states: RUNNING while any step is RUNNING or
// still PENDING (reachable), FAILED when all steps are terminal and at least one FAILED
// without continueOnError, otherwise SUCCEEDED. The user-set PAUSED and CANCELLED states
// are not derived here; the caller holds them on the run and does not re-derive while they
// apply.
func DeriveRunStatus(steps []Step, statuses map[string]StepStatus) RunStatus {
	if anyInFlight(statuses) {
		return RunRunning
	}
	if anyHardFailure(steps, statuses) {
		return RunFailed
	}
	return RunSucceeded
}

// anyInFlight reports whether any step is still RUNNING or PENDING, meaning the run has not
// finished scheduling.
func anyInFlight(statuses map[string]StepStatus) bool {
	for _, s := range statuses {
		if s == StepRunning || s == StepPending {
			return true
		}
	}
	return false
}

// anyHardFailure reports whether any step FAILED and was not marked continueOnError, which
// makes the finished run FAILED (format doc decision 3).
func anyHardFailure(steps []Step, statuses map[string]StepStatus) bool {
	for i := range steps {
		if statuses[steps[i].ID] == StepFailed && !steps[i].ContinueOnError {
			return true
		}
	}
	return false
}
