package eventtypes

import (
	"fmt"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/awslabs/filemoverexpress/logger"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// WorkflowRunCompleteEvent announces that a run reached a terminal state (SUCCEEDED,
// FAILED, or CANCELLED), carrying the completion timestamp so the GUI stamps the row's
// Completed column without a refresh.
type WorkflowRunCompleteEvent struct {
	RunID     string
	Name      string
	Status    fmev1.WorkflowRunStatus
	Completed time.Time
}

func (e *WorkflowRunCompleteEvent) String() string {
	return fmt.Sprintf("Workflow run %s (%s) completed with status %s", e.RunID, e.Name, e.Status)
}

func (*WorkflowRunCompleteEvent) Type() MessageFlags {
	return WorkflowRunCompleteEventType
}

func (*WorkflowRunCompleteEvent) Priority() logger.LogLevel {
	return EventPriority
}

func (e *WorkflowRunCompleteEvent) ToProtobuf() (fmev1.PbEvent, fmev1.EventType) {
	pbEvent := &fmev1.WorkflowRunCompleteEvent{
		RunId:     e.RunID,
		Name:      e.Name,
		Status:    e.Status,
		Completed: timestamppb.New(e.Completed),
	}
	msgEvent := &fmev1.ListEventsResponse_WorkflowRunCompleteEvent{WorkflowRunCompleteEvent: pbEvent}
	return msgEvent, fmev1.EventType_EVENT_TYPE_WORKFLOW_RUN_COMPLETE_EVENT_TYPE
}
