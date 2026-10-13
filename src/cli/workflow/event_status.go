package workflow

import (
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// protoSteps maps a run's domain steps to proto steps, for the started event's step list.
// It mirrors the per-step shape the service layer's toProtoWorkflowRun builds; the
// duplication keeps the workflow package independent of service.
func protoSteps(steps []WorkflowStep) []*fmev1.WorkflowStep {
	out := make([]*fmev1.WorkflowStep, 0, len(steps))
	for i := range steps {
		s := steps[i]
		out = append(out, &fmev1.WorkflowStep{
			StepId: s.StepID,
			Name:   s.Name,
			Type:   s.Type,
			Status: protoStepStatus(s.Status),
			JobId:  s.JobID,
			Error:  s.Error,
		})
	}
	return out
}

// protoRunStatus maps an engine RunStatus to its proto enum, for building live events. It
// mirrors the service layer's toProtoRunStatus; the duplication keeps the workflow package
// free of a dependency on service (which would invert the layering).
func protoRunStatus(s RunStatus) fmev1.WorkflowRunStatus {
	switch s {
	case RunPending:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PENDING
	case RunRunning:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_RUNNING
	case RunPaused:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PAUSED
	case RunSucceeded:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_SUCCEEDED
	case RunFailed:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_FAILED
	case RunCancelled:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_CANCELLED
	default:
		return fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_UNSPECIFIED
	}
}

// protoStepStatus maps an engine StepStatus to its proto enum, for building live events.
func protoStepStatus(s StepStatus) fmev1.WorkflowStepStatus {
	switch s {
	case StepPending:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_PENDING
	case StepRunning:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_RUNNING
	case StepSucceeded:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SUCCEEDED
	case StepFailed:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_FAILED
	case StepSkipped:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SKIPPED
	default:
		return fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_UNSPECIFIED
	}
}
