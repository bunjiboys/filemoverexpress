package eventtypes

import (
	"fmt"

	"github.com/awslabs/filemoverexpress/logger"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// WorkflowStepStatusChangeEvent announces one step's status transition within a run, so the
// GUI updates that step (and the run's progress rollup) live.
type WorkflowStepStatusChangeEvent struct {
	RunID  string
	StepID string
	Status fmev1.WorkflowStepStatus
}

func (e *WorkflowStepStatusChangeEvent) String() string {
	return fmt.Sprintf("Workflow run %s step %s status changed to %s", e.RunID, e.StepID, e.Status)
}

func (*WorkflowStepStatusChangeEvent) Type() MessageFlags {
	return WorkflowStepStatusChangeEventType
}

func (*WorkflowStepStatusChangeEvent) Priority() logger.LogLevel {
	return EventPriority
}

func (e *WorkflowStepStatusChangeEvent) ToProtobuf() (fmev1.PbEvent, fmev1.EventType) {
	pbEvent := &fmev1.WorkflowStepStatusChangeEvent{
		RunId:  e.RunID,
		StepId: e.StepID,
		Status: e.Status,
	}
	msgEvent := &fmev1.ListEventsResponse_WorkflowStepStatusChangeEvent{WorkflowStepStatusChangeEvent: pbEvent}
	return msgEvent, fmev1.EventType_EVENT_TYPE_WORKFLOW_STEP_STATUS_CHANGE_EVENT_TYPE
}
