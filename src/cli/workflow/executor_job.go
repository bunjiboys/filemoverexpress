package workflow

import (
	"context"
	"fmt"

	"github.com/awslabs/filemoverexpress/config"
	"github.com/awslabs/filemoverexpress/core/download"
	"github.com/awslabs/filemoverexpress/core/upload"
	"github.com/awslabs/filemoverexpress/events"
	"github.com/awslabs/filemoverexpress/types/configtypes"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	"github.com/awslabs/filemoverexpress/types/jobmanagertypes"
	"github.com/awslabs/filemoverexpress/types/transfertypes"
)

// jobEventBuffer sizes the per-step listener channel. A workflow step observes only its
// own job's complete/error event, but the bus delivers all matching events to every
// listener, so a small buffer avoids blocking the bus's delivery goroutine between the
// executor's select iterations.
const jobEventBuffer = 8

// JobExecutor runs an Upload or Download step: it builds a JobConfig from the step's
// `with`, creates the runtime job, dispatches it to the uploader/downloader, and waits for
// the job to finish by SUBSCRIBING to the event bus (format doc "The Job step payload" +
// "Core principle: everything runs in the daemon"). The transfer direction is fixed at
// construction (Upload or Download) and comes from the step TYPE, not an author-supplied
// field. One JobExecutor instance is registered per direction. The uploader/downloader are
// fire-and-forget and report completion only as events, so the bus is the completion
// signal. All external calls are injected seams so the mapping and the wait logic are
// tested without a real transfer; only the one dispatch line into upload/download is faked
// in tests.
type JobExecutor struct {
	direction      transfertypes.Direction
	resolveProfile func(name string) (configtypes.TransferProfile, error)
	newJob         func(jobmanagertypes.JobConfig) (*jobmanagertypes.Job, error)
	dispatch       func(transfertypes.Direction, *jobmanagertypes.Job)
	register       func(id string, ch chan eventtypes.Event, filters ...eventtypes.MessageFlags) error
	remove         func(id string) error
}

// NewJobExecutor builds a JobExecutor for the given direction, wired to the real config
// resolver, NewJob, the upload/download dispatch, and the event bus register/remove calls.
func NewJobExecutor(direction transfertypes.Direction) *JobExecutor {
	return &JobExecutor{
		direction: direction,
		resolveProfile: func(name string) (configtypes.TransferProfile, error) {
			// COVERAGE: justified-unreachable in unit tests. This closure calls
			// config.LoadConfiguration(), which reads the daemon's on-disk config; a unit
			// test injects a fake resolveProfile instead. buildConfig's mapping and error
			// handling ARE covered. See the implementation plan section 7.
			return config.LoadConfiguration().GetTransferProfile(name)
		},
		newJob:   jobmanagertypes.NewJob,
		dispatch: dispatchJob,
		register: events.Events.RegisterListener,
		remove:   events.Events.RemoveListener,
	}
}

// dispatchJob calls the real uploader or downloader for the job's direction.
//
// COVERAGE: justified-unreachable in unit tests. upload.Uploader / download.Downloader
// reach into the job_manager singleton (which spawns real transfer workers) and a live
// AWS session, so they are not exercised in a unit test; the executor's tests inject a
// fake dispatch instead. The mapping and the event-wait logic ARE fully covered. This one
// line is the sole uncovered statement, isolated here so the rest of the file is 100%.
// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md section 7.
func dispatchJob(direction transfertypes.Direction, job *jobmanagertypes.Job) {
	if direction == transfertypes.Download {
		download.Downloader(job)
		return
	}
	upload.Uploader(job)
}

// Execute builds and runs the job, then blocks until the bus reports the job's completion
// (mapping a JobErrorEvent or a JobCompleteEvent with task errors to a step error) or the
// context is cancelled.
func (j *JobExecutor) Execute(ctx context.Context, step Step) error {
	cfg, err := j.buildConfig(ctx, step)
	if err != nil {
		return err
	}
	job, err := j.newJob(cfg)
	if err != nil {
		return fmt.Errorf("workflow: job step %s: %w", step.ID, err)
	}

	listenerID := "workflow-step-" + job.JobId()
	ch := make(chan eventtypes.Event, jobEventBuffer)
	if err := j.register(listenerID, ch, eventtypes.JobCompleteEventType, eventtypes.JobErrorEventType); err != nil {
		return fmt.Errorf("workflow: job step %s subscribing to events: %w", step.ID, err)
	}
	defer func() { _ = j.remove(listenerID) }()

	j.dispatch(cfg.Direction, job)
	return waitForJob(ctx, ch, job.JobId(), step.ID)
}

// buildConfig maps the step's `with` to a JobConfig, resolving the named transfer profile.
// The transfer direction is the executor's own (fixed by the step type), not read from
// `with`. The profile is referenced by name only (format doc "Portability"). It also
// stamps workflow provenance (the run id from ctx + the step id) onto the config so the
// created job carries it, which the lifecycle adapter uses to resolve a step to its
// runtime job.
func (j *JobExecutor) buildConfig(ctx context.Context, step Step) (jobmanagertypes.JobConfig, error) {
	profile, err := j.resolveProfile(withString(step.With, "transferProfile"))
	if err != nil {
		return jobmanagertypes.JobConfig{}, fmt.Errorf("workflow: job step %s: %w", step.ID, err)
	}
	return jobmanagertypes.JobConfig{
		Direction:       j.direction,
		Name:            step.Name,
		TransferProfile: &profile,
		Destination:     withString(step.With, "destination"),
		Sources:         withStringSlice(step.With, "sources"),
		S3PrefixToTrim:  withString(step.With, "s3PrefixToTrim"),
		Force:           withBool(step.With, "force", false),
		UploadBasePath:  withString(step.With, "uploadBasePath"),
		WorkflowRunID:   runIDFrom(ctx),
		WorkflowStepID:  step.ID,
	}, nil
}

// waitForJob blocks until an event for jobID arrives on ch: a JobErrorEvent, or a
// JobCompleteEvent (which fails the step when it carries task errors). Events for other
// jobs are ignored. A cancelled context ends the wait with the context error.
func waitForJob(ctx context.Context, ch <-chan eventtypes.Event, jobID, stepID string) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case evt := <-ch:
			if done, err := jobOutcome(evt, jobID, stepID); done {
				return err
			}
		}
	}
}

// jobOutcome inspects one event: it returns done=false for an event about another job,
// and done=true with the step's error (nil on clean success) for this job's terminal
// event.
func jobOutcome(evt eventtypes.Event, jobID, stepID string) (bool, error) {
	switch e := evt.(type) {
	case *eventtypes.JobErrorEvent:
		if e.Id != jobID {
			return false, nil
		}
		return true, fmt.Errorf("workflow: job step %s failed: %w", stepID, e.Err)
	case *eventtypes.JobCompleteEvent:
		if e.Id != jobID {
			return false, nil
		}
		if e.HasTaskErrors {
			return true, fmt.Errorf("workflow: job step %s completed with task errors", stepID)
		}
		return true, nil
	default:
		// COVERAGE: justified-unreachable defensive branch. The listener is registered
		// with a filter for exactly JobCompleteEventType and JobErrorEventType, so the bus
		// delivers only those two event types to ch; no other type reaches here. Kept so a
		// future filter change fails safe (keep waiting) rather than mishandling; not
		// covered because the filter admits no third type.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return false, nil
	}
}
