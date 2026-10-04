package service

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
	"github.com/awslabs/filemoverexpress/workflow"
)

// toProtoWorkflowRun maps a persisted engine WorkflowRun to its proto message, including
// each step and the run/step status enums. The timestamps are emitted as protobuf
// Timestamps (a zero time becomes a zero Timestamp, which the GUI treats as unset).
func toProtoWorkflowRun(run *workflow.WorkflowRun) *fmev1.WorkflowRun {
	steps := make([]*fmev1.WorkflowStep, 0, len(run.Steps))
	for i := range run.Steps {
		s := run.Steps[i]
		steps = append(steps, &fmev1.WorkflowStep{
			StepId: s.StepID,
			Name:   s.Name,
			Type:   s.Type,
			Status: toProtoStepStatus(s.Status),
			JobId:  s.JobID,
			Error:  s.Error,
		})
	}
	return &fmev1.WorkflowRun{
		RunId:     run.RunID,
		Name:      run.Name,
		Status:    toProtoRunStatus(run.Status),
		Steps:     steps,
		Created:   timestamppb.New(run.Created),
		Started:   timestamppb.New(run.Started),
		Completed: timestamppb.New(run.Completed),
	}
}

// toProtoRunStatus maps an engine RunStatus to its proto enum value.
func toProtoRunStatus(s workflow.RunStatus) fmev1.WorkflowRunStatus {
	switch s {
	case workflow.RunPending:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PENDING
	case workflow.RunRunning:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_RUNNING
	case workflow.RunPaused:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PAUSED
	case workflow.RunSucceeded:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_SUCCEEDED
	case workflow.RunFailed:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_FAILED
	case workflow.RunCancelled:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_CANCELLED
	default:
		// COVERAGE: justified-unreachable defensive branch. s is always one of the six
		// RunStatus constants the engine assigns; no other value reaches here. Kept so a
		// future status maps to UNSPECIFIED rather than silently mismatching.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_UNSPECIFIED
	}
}

// toProtoStepStatus maps an engine StepStatus to its proto enum value.
func toProtoStepStatus(s workflow.StepStatus) fmev1.WorkflowStepStatus {
	switch s {
	case workflow.StepPending:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_PENDING
	case workflow.StepRunning:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_RUNNING
	case workflow.StepSucceeded:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SUCCEEDED
	case workflow.StepFailed:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_FAILED
	case workflow.StepSkipped:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SKIPPED
	default:
		// COVERAGE: justified-unreachable defensive branch. s is always one of the five
		// StepStatus constants the engine assigns; no other value reaches here. Kept so a
		// future status maps to UNSPECIFIED rather than silently mismatching.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_UNSPECIFIED
	}
}
