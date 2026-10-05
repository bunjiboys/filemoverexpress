package upload

import (
	"errors"
	"testing"
	"time"

	"github.com/awslabs/filemoverexpress/events"
	"github.com/awslabs/filemoverexpress/types/configtypes"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	"github.com/awslabs/filemoverexpress/types/jobmanagertypes"
	"github.com/awslabs/filemoverexpress/types/transfertypes"
)

// failJob is the shared job-start failure path for the uploader. A job-start failure must
// emit a JobErrorEvent carrying the job id so a consumer waiting on the job's terminal
// event (the workflow executor) is unblocked rather than left waiting forever. It must
// also mark the job errored.
func TestFailJobEmitsJobErrorEvent(t *testing.T) {
	job, err := jobmanagertypes.NewJob(jobmanagertypes.JobConfig{
		Direction:       transfertypes.Upload,
		Name:            "archive",
		TransferProfile: &configtypes.TransferProfile{Name: "egress"},
	})
	if err != nil {
		t.Fatalf("NewJob: %v", err)
	}

	ch := make(chan eventtypes.Event, 1)
	const listenerID = "test-upload-failjob"
	if regErr := events.Events.RegisterListener(listenerID, ch, eventtypes.JobErrorEventType); regErr != nil {
		t.Fatalf("RegisterListener: %v", regErr)
	}
	t.Cleanup(func() { _ = events.Events.RemoveListener(listenerID) })

	failJob(job, errors.New("base path must be absolute: got archive/"))

	select {
	case evt := <-ch:
		jee, ok := evt.(*eventtypes.JobErrorEvent)
		if !ok {
			t.Fatalf("expected *JobErrorEvent, got %T", evt)
		}
		if jee.Id != job.JobId() {
			t.Errorf("event Id = %q, want job id %q", jee.Id, job.JobId())
		}
		if jee.Err == nil || jee.Err.Error() != "base path must be absolute: got archive/" {
			t.Errorf("event Err = %v", jee.Err)
		}
	case <-time.After(time.Second):
		t.Fatal("no JobErrorEvent was emitted; a job-start failure would leave the workflow run stuck")
	}

	if job.Status() != jobmanagertypes.JobStatusError {
		t.Errorf("job status = %q, want %q", job.Status(), jobmanagertypes.JobStatusError)
	}
}
