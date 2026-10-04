package service

import (
	"context"
	"sync"

	"connectrpc.com/connect"

	"github.com/awslabs/filemoverexpress/events"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// workflowJobEventBuffer sizes the adapter's listener channel. The bus delivers every
// JobCreateEvent to each listener; a small buffer absorbs a burst of job creations between
// the drain goroutine's iterations without blocking the bus's delivery goroutine.
const workflowJobEventBuffer = 16

// workflowJobLifecycle is the production JobLifecycle for one workflow run (Option B,
// event-sourced). It subscribes to the event bus for JobCreateEvent and builds a
// step-id -> runtime-job-id map from the events tagged with THIS run's id (the daemon
// stamps workflow_run_id / workflow_step_id onto every job a Job step creates). When the
// engine cascades Cancel/Pause/Resume for a step, the adapter resolves the step to its job
// id and invokes the existing job-lifecycle RPC handlers, so the cancel/pause/resume job
// logic is reused verbatim rather than duplicated.
type workflowJobLifecycle struct {
	runID  string
	server *FileMoverServer

	mu         sync.Mutex
	stepToJob  map[string]string
	listenerID string
}

// newWorkflowJobLifecycle creates and subscribes an adapter for a run, returning it and a
// cleanup that unsubscribes it from the bus. The manager calls cleanup when the run ends.
func newWorkflowJobLifecycle(server *FileMoverServer, runID string) (*workflowJobLifecycle, func()) {
	adapter := &workflowJobLifecycle{
		runID:      runID,
		server:     server,
		stepToJob:  make(map[string]string),
		listenerID: "workflow-lifecycle-" + runID,
	}
	ch := make(chan eventtypes.Event, workflowJobEventBuffer)
	if err := events.Events.RegisterListener(adapter.listenerID, ch, eventtypes.JobCreateEventType); err != nil {
		// COVERAGE: justified-unreachable defensive branch. RegisterListener fails only on
		// a duplicate listener id, and the id here is "workflow-lifecycle-"+runID with a
		// unique run id, so no duplicate can occur. Kept so a registration failure degrades
		// the cascade to a no-op for this run (empty map) rather than crashing a live run.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		events.Events.Warn("workflow: run %s subscribing to job events: %s", runID, err)
		return adapter, func() {}
	}
	done := make(chan struct{})
	go adapter.consume(ch, done)
	cleanup := func() {
		_ = events.Events.RemoveListener(adapter.listenerID)
		close(done)
	}
	return adapter, cleanup
}

// consume records the step-id -> job-id mapping from each JobCreateEvent tagged with this
// run until cleanup removes the listener and closes done.
func (w *workflowJobLifecycle) consume(ch <-chan eventtypes.Event, done <-chan struct{}) {
	for {
		select {
		case <-done:
			return
		case evt := <-ch:
			create, ok := evt.(*eventtypes.JobCreateEvent)
			if !ok || create.WorkflowRunID != w.runID || create.WorkflowStepID == "" {
				continue
			}
			w.mu.Lock()
			w.stepToJob[create.WorkflowStepID] = create.Id
			w.mu.Unlock()
		}
	}
}

// jobIDFor returns the runtime job id a step created, or "" when no job for the step has
// been observed yet (the step has not reached job creation, or is not a Job step).
func (w *workflowJobLifecycle) jobIDFor(stepID string) string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.stepToJob[stepID]
}

// Cancel resolves the step to its job and cancels it via the existing CancelJob handler. A
// step with no observed job (not a Job step, or its job not yet created) is a no-op.
func (w *workflowJobLifecycle) Cancel(stepID string) {
	if jobID := w.jobIDFor(stepID); jobID != "" {
		_, _ = w.server.CancelJob(context.Background(), connect.NewRequest(&fmev1.CancelJobRequest{JobId: jobID}))
	}
}

// Pause resolves the step to its job and pauses it via the existing PauseJob handler.
func (w *workflowJobLifecycle) Pause(stepID string) {
	if jobID := w.jobIDFor(stepID); jobID != "" {
		_, _ = w.server.PauseJob(context.Background(), connect.NewRequest(&fmev1.PauseJobRequest{JobId: jobID}))
	}
}

// Resume resolves the step to its job and resumes it via the existing ResumeJob handler.
func (w *workflowJobLifecycle) Resume(stepID string) {
	if jobID := w.jobIDFor(stepID); jobID != "" {
		_, _ = w.server.ResumeJob(context.Background(), connect.NewRequest(&fmev1.ResumeJobRequest{JobId: jobID}))
	}
}
