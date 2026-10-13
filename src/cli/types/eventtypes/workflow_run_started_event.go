package eventtypes

import (
	"fmt"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/awslabs/filemoverexpress/logger"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// WorkflowRunStartedEvent announces that a workflow run has begun executing. It carries the
// run's steps (all PENDING at this point) so the GUI runs table renders the complete row
// immediately, without a manual refresh; later step-status events patch these steps.
type WorkflowRunStartedEvent struct {
	RunID   string
	Name    string
	Started time.Time
	Steps   []*fmev1.WorkflowStep
}

func (e *WorkflowRunStartedEvent) String() string {
	return fmt.Sprintf("Workflow run %s (%s) started", e.RunID, e.Name)
}

func (*WorkflowRunStartedEvent) Type() MessageFlags {
	return WorkflowRunStartedEventType
}

func (*WorkflowRunStartedEvent) Priority() logger.LogLevel {
	return EventPriority
}

func (e *WorkflowRunStartedEvent) ToProtobuf() (fmev1.PbEvent, fmev1.EventType) {
	pbEvent := &fmev1.WorkflowRunStartedEvent{
		RunId:   e.RunID,
		Name:    e.Name,
		Started: timestamppb.New(e.Started),
		Steps:   e.Steps,
	}
	msgEvent := &fmev1.ListEventsResponse_WorkflowRunStartedEvent{WorkflowRunStartedEvent: pbEvent}
	return msgEvent, fmev1.EventType_EVENT_TYPE_WORKFLOW_RUN_STARTED_EVENT_TYPE
}
