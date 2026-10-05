package workflow

import (
	"context"
	"errors"
	"testing"

	"github.com/awslabs/filemoverexpress/types/configtypes"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	"github.com/awslabs/filemoverexpress/types/jobmanagertypes"
	"github.com/awslabs/filemoverexpress/types/transfertypes"
)

// jobHarness builds a JobExecutor with fakes: it captures the JobConfig and direction,
// records the filters the listener was registered with, and exposes the listener channel
// so a test can push completion/error events as the real bus would.
type jobHarness struct {
	cfg       jobmanagertypes.JobConfig
	direction transfertypes.Direction
	filters   []eventtypes.MessageFlags
	ch        chan eventtypes.Event
	removed   bool
	created   chan *jobmanagertypes.Job
}

func newJobHarness(t *testing.T) (*JobExecutor, *jobHarness) {
	return newJobHarnessDir(t, transfertypes.Upload)
}

func newJobHarnessDir(t *testing.T, direction transfertypes.Direction) (*JobExecutor, *jobHarness) {
	t.Helper()
	h := &jobHarness{ch: make(chan eventtypes.Event, 1), created: make(chan *jobmanagertypes.Job, 1)}
	exec := &JobExecutor{
		direction: direction,
		resolveProfile: func(name string) (configtypes.TransferProfile, error) {
			if name == "" {
				return configtypes.TransferProfile{}, errors.New("empty profile")
			}
			return configtypes.TransferProfile{Name: name}, nil
		},
		newJob: func(cfg jobmanagertypes.JobConfig) (*jobmanagertypes.Job, error) {
			h.cfg = cfg
			job, err := jobmanagertypes.NewJob(cfg)
			if err == nil {
				h.created <- job
			}
			return job, err
		},
		dispatch: func(dir transfertypes.Direction, _ *jobmanagertypes.Job) {
			h.direction = dir
		},
		register: func(_ string, ch chan eventtypes.Event, filters ...eventtypes.MessageFlags) error {
			h.filters = filters
			// Bridge: forward the test's channel into the one the executor waits on.
			go func() {
				for e := range h.ch {
					ch <- e
				}
			}()
			return nil
		},
		remove: func(string) error { h.removed = true; return nil },
	}
	return exec, h
}

func jobStep() Step {
	return Step{ID: "ingest", Name: "Ingest cards", Type: StepUpload, With: map[string]any{
		"transferProfile": "prod",
		"sources":         []any{"/a", "/b"},
		"destination":     "shows/day",
		"uploadBasePath":  "/vol",
		"force":           true,
	}}
}

func TestJobExecutorStampsWorkflowProvenance(t *testing.T) {
	exec, h := newJobHarness(t)
	step := jobStep()
	go func() {
		job := <-h.created
		h.ch <- stampJobID(&eventtypes.JobCompleteEvent{HasSuccessfulTasks: true}, job.JobId())
	}()
	// Execute under a run-id context: the config must carry the run id and the step id so
	// the created job is traceable back to its workflow step.
	if err := exec.Execute(WithRunID(context.Background(), "wfr-123"), step); err != nil {
		t.Fatalf("Execute err = %v", err)
	}
	if h.cfg.WorkflowRunID != "wfr-123" {
		t.Errorf("WorkflowRunID = %q, want wfr-123", h.cfg.WorkflowRunID)
	}
	if h.cfg.WorkflowStepID != step.ID {
		t.Errorf("WorkflowStepID = %q, want %q", h.cfg.WorkflowStepID, step.ID)
	}
}

// runWithEvent runs the executor and, once the job exists, pushes evt stamped with the
// job's id to simulate completion. Matching is by runtime job id.
func runWithEvent(exec *JobExecutor, h *jobHarness, step Step, evt eventtypes.Event) error {
	go func() {
		job := <-h.created
		h.ch <- stampJobID(evt, job.JobId())
	}()
	return exec.Execute(context.Background(), step)
}

// stampJobID sets the job id on a job completion/error event so it matches the running
// step's job.
func stampJobID(evt eventtypes.Event, id string) eventtypes.Event {
	switch e := evt.(type) {
	case *eventtypes.JobCompleteEvent:
		e.Id = id
	case *eventtypes.JobErrorEvent:
		e.Id = id
	}
	return evt
}

func TestJobExecutorMapsConfigAndSucceeds(t *testing.T) {
	exec, h := newJobHarness(t)
	step := jobStep()
	err := runWithEvent(exec, h, step, &eventtypes.JobCompleteEvent{Name: "Ingest cards", HasSuccessfulTasks: true})
	if err != nil {
		t.Fatalf("Execute err = %v", err)
	}
	if h.direction != transfertypes.Upload {
		t.Errorf("direction = %q, want upload", h.direction)
	}
	if h.cfg.Name != "Ingest cards" || h.cfg.Destination != "shows/day" || h.cfg.UploadBasePath != "/vol" {
		t.Errorf("JobConfig = %+v", h.cfg)
	}
	if len(h.cfg.Sources) != 2 || !h.cfg.Force {
		t.Errorf("JobConfig sources/force = %+v", h.cfg)
	}
	if !h.removed {
		t.Error("listener was not removed")
	}
}

func TestJobExecutorRegistersOnlyJobEventFilters(t *testing.T) {
	exec, h := newJobHarness(t)
	_ = runWithEvent(exec, h, jobStep(), &eventtypes.JobCompleteEvent{Name: "Ingest cards"})
	if len(h.filters) != 2 {
		t.Fatalf("filters = %v, want exactly the two job event types", h.filters)
	}
	want := map[eventtypes.MessageFlags]bool{
		eventtypes.JobCompleteEventType: true,
		eventtypes.JobErrorEventType:    true,
	}
	for _, f := range h.filters {
		if !want[f] {
			t.Errorf("unexpected filter %v registered", f)
		}
	}
}

func TestJobExecutorDownloadDirection(t *testing.T) {
	exec, h := newJobHarnessDir(t, transfertypes.Download)
	step := jobStep()
	step.Type = StepDownload
	step.With["s3PrefixToTrim"] = "trim/"
	err := runWithEvent(exec, h, step, &eventtypes.JobCompleteEvent{Name: "Ingest cards"})
	if err != nil {
		t.Fatalf("Execute err = %v", err)
	}
	if h.direction != transfertypes.Download {
		t.Errorf("direction = %q, want download", h.direction)
	}
	if h.cfg.S3PrefixToTrim != "trim/" {
		t.Errorf("S3PrefixToTrim = %q", h.cfg.S3PrefixToTrim)
	}
}

func TestJobExecutorJobErrorEventFails(t *testing.T) {
	exec, h := newJobHarness(t)
	err := runWithEvent(exec, h, jobStep(), &eventtypes.JobErrorEvent{Name: "Ingest cards", Err: errors.New("transfer failed")})
	if err == nil {
		t.Fatal("expected a step error from a JobErrorEvent")
	}
}

func TestJobExecutorCompleteWithTaskErrorsFails(t *testing.T) {
	exec, h := newJobHarness(t)
	err := runWithEvent(exec, h, jobStep(), &eventtypes.JobCompleteEvent{Name: "Ingest cards", HasTaskErrors: true})
	if err == nil {
		t.Fatal("expected a step error when the job completed with task errors")
	}
}

func TestJobExecutorIgnoresOtherJobsEvents(t *testing.T) {
	exec, h := newJobHarness(t)
	step := jobStep()
	// First an event for a different job id, then the matching completion.
	go func() {
		job := <-h.created
		h.ch <- &eventtypes.JobCompleteEvent{Id: "some-other-job-id"}
		h.ch <- &eventtypes.JobCompleteEvent{Id: job.JobId()}
	}()
	if err := exec.Execute(context.Background(), step); err != nil {
		t.Fatalf("Execute err = %v (should ignore the unrelated event and wait)", err)
	}
}

func TestJobExecutorMissingProfile(t *testing.T) {
	exec, _ := newJobHarness(t)
	step := jobStep()
	step.With["transferProfile"] = ""
	if err := exec.Execute(context.Background(), step); err == nil {
		t.Fatal("expected an error for a missing profile")
	}
}

func TestJobExecutorRegisterError(t *testing.T) {
	exec, _ := newJobHarness(t)
	exec.register = func(string, chan eventtypes.Event, ...eventtypes.MessageFlags) error {
		return errors.New("already registered")
	}
	if err := exec.Execute(context.Background(), jobStep()); err == nil {
		t.Fatal("expected the register error to surface")
	}
}

func TestJobExecutorCancellation(t *testing.T) {
	exec, _ := newJobHarness(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	// No event is ever pushed; cancellation must unblock the wait.
	if err := exec.Execute(ctx, jobStep()); err == nil {
		t.Fatal("expected a cancellation error")
	}
}

func TestNewJobExecutorWiresSeams(t *testing.T) {
	exec := NewJobExecutor(transfertypes.Upload)
	if exec.resolveProfile == nil || exec.newJob == nil || exec.dispatch == nil ||
		exec.register == nil || exec.remove == nil {
		t.Fatal("NewJobExecutor did not wire all seams")
	}
	if exec.direction != transfertypes.Upload {
		t.Errorf("direction = %q, want upload", exec.direction)
	}
}

func TestJobExecutorNewJobError(t *testing.T) {
	exec, _ := newJobHarness(t)
	exec.newJob = func(jobmanagertypes.JobConfig) (*jobmanagertypes.Job, error) {
		return nil, errors.New("cannot create job")
	}
	if err := exec.Execute(context.Background(), jobStep()); err == nil {
		t.Fatal("expected the newJob error to surface")
	}
}

func TestJobOutcome(t *testing.T) {
	cases := []struct {
		name     string
		evt      eventtypes.Event
		wantDone bool
		wantErr  bool
	}{
		{"error event for us", &eventtypes.JobErrorEvent{Id: "job-1", Err: errors.New("x")}, true, true},
		{"error event for another job", &eventtypes.JobErrorEvent{Id: "other"}, false, false},
		{"complete for us clean", &eventtypes.JobCompleteEvent{Id: "job-1"}, true, false},
		{"complete for us with task errors", &eventtypes.JobCompleteEvent{Id: "job-1", HasTaskErrors: true}, true, true},
		{"complete for another job", &eventtypes.JobCompleteEvent{Id: "other"}, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			done, err := jobOutcome(tc.evt, "job-1", "step-1")
			if done != tc.wantDone {
				t.Errorf("done = %v, want %v", done, tc.wantDone)
			}
			if (err != nil) != tc.wantErr {
				t.Errorf("err = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}
