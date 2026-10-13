package eventtypes

import (
	"fmt"

	"github.com/awslabs/filemoverexpress/logger"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// WorkflowRunStatusChangeEvent announces a non-terminal run status transition (e.g. PENDING
// -> RUNNING, RUNNING -> PAUSED). A terminal transition is announced by
// WorkflowRunCompleteEvent instead, which also carries the completion timestamp.
type WorkflowRunStatusChangeEvent struct {
	RunID  string
	Status fmev1.WorkflowRunStatus
}

func (e *WorkflowRunStatusChangeEvent) String() string {
	return fmt.Sprintf("Workflow run %s status changed to %s", e.RunID, e.Status)
}

func (*WorkflowRunStatusChangeEvent) Type() MessageFlags {
	return WorkflowRunStatusChangeEventType
}

func (*WorkflowRunStatusChangeEvent) Priority() logger.LogLevel {
	return EventPriority
}

func (e *WorkflowRunStatusChangeEvent) ToProtobuf() (fmev1.PbEvent, fmev1.EventType) {
	pbEvent := &fmev1.WorkflowRunStatusChangeEvent{
		RunId:  e.RunID,
		Status: e.Status,
	}
	msgEvent := &fmev1.ListEventsResponse_WorkflowRunStatusChangeEvent{WorkflowRunStatusChangeEvent: pbEvent}
	return msgEvent, fmev1.EventType_EVENT_TYPE_WORKFLOW_RUN_STATUS_CHANGE_EVENT_TYPE
}
