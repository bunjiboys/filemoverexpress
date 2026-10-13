package eventtypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

func TestWorkflowRunStartedEvent(t *testing.T) {
	evt := WorkflowRunStartedEvent{
		RunID:   "r1",
		Name:    "nightly",
		Started: time.Unix(100, 0),
		Steps: []*fmev1.WorkflowStep{
			{StepId: "s1", Name: "copy", Type: "Upload", Status: fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_PENDING},
		},
	}

	assert.Equal(t, "Workflow run r1 (nightly) started", evt.String())
	assert.Equal(t, WorkflowRunStartedEventType, evt.Type())
	assert.Equal(t, EventPriority, evt.Priority())

	pb, pbType := evt.ToProtobuf()
	assert.Equal(t, fmev1.EventType_EVENT_TYPE_WORKFLOW_RUN_STARTED_EVENT_TYPE, pbType)
	wrapped, ok := pb.(*fmev1.ListEventsResponse_WorkflowRunStartedEvent)
	assert.True(t, ok)
	assert.Len(t, wrapped.WorkflowRunStartedEvent.Steps, 1)
	assert.Equal(t, "s1", wrapped.WorkflowRunStartedEvent.Steps[0].StepId)
}

func TestWorkflowRunStatusChangeEvent(t *testing.T) {
	evt := WorkflowRunStatusChangeEvent{RunID: "r1", Status: fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PAUSED}

	assert.Contains(t, evt.String(), "r1")
	assert.Equal(t, WorkflowRunStatusChangeEventType, evt.Type())
	assert.Equal(t, EventPriority, evt.Priority())

	pb, pbType := evt.ToProtobuf()
	assert.Equal(t, fmev1.EventType_EVENT_TYPE_WORKFLOW_RUN_STATUS_CHANGE_EVENT_TYPE, pbType)
	assert.IsType(t, &fmev1.ListEventsResponse_WorkflowRunStatusChangeEvent{}, pb)
}

func TestWorkflowStepStatusChangeEvent(t *testing.T) {
	evt := WorkflowStepStatusChangeEvent{
		RunID:  "r1",
		StepID: "s1",
		Status: fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_RUNNING,
	}

	assert.Contains(t, evt.String(), "s1")
	assert.Equal(t, WorkflowStepStatusChangeEventType, evt.Type())
	assert.Equal(t, EventPriority, evt.Priority())

	pb, pbType := evt.ToProtobuf()
	assert.Equal(t, fmev1.EventType_EVENT_TYPE_WORKFLOW_STEP_STATUS_CHANGE_EVENT_TYPE, pbType)
	assert.IsType(t, &fmev1.ListEventsResponse_WorkflowStepStatusChangeEvent{}, pb)
}

func TestWorkflowRunCompleteEvent(t *testing.T) {
	evt := WorkflowRunCompleteEvent{
		RunID:     "r1",
		Name:      "nightly",
		Status:    fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_SUCCEEDED,
		Completed: time.Unix(200, 0),
	}

	assert.Contains(t, evt.String(), "nightly")
	assert.Equal(t, WorkflowRunCompleteEventType, evt.Type())
	assert.Equal(t, EventPriority, evt.Priority())

	pb, pbType := evt.ToProtobuf()
	assert.Equal(t, fmev1.EventType_EVENT_TYPE_WORKFLOW_RUN_COMPLETE_EVENT_TYPE, pbType)
	assert.IsType(t, &fmev1.ListEventsResponse_WorkflowRunCompleteEvent{}, pb)
}
