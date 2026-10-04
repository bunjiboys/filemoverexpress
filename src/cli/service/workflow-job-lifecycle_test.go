package service

import (
	"testing"
	"time"

	"github.com/awslabs/filemoverexpress/core/job_manager"
	"github.com/awslabs/filemoverexpress/events"
	"github.com/awslabs/filemoverexpress/types/configtypes"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	"github.com/awslabs/filemoverexpress/types/jobmanagertypes"
	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
	"github.com/awslabs/filemoverexpress/workflow"
)

// waitFor polls cond until true or a short deadline, failing the test on timeout.
func waitFor(t *testing.T, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for: %s", msg)
}

func TestWorkflowJobLifecycleMapsStepToJobForItsRun(t *testing.T) {
	adapter, cleanup := newWorkflowJobLifecycle(&FileMoverServer{}, "run-A")
	defer cleanup()

	// A job created by a step of THIS run is recorded.
	events.Events.Send(&eventtypes.JobCreateEvent{
		Id: "job-1", Name: "step one", WorkflowRunID: "run-A", WorkflowStepID: "s1",
	})
	// A job for ANOTHER run is ignored.
	events.Events.Send(&eventtypes.JobCreateEvent{
		Id: "job-2", Name: "other", WorkflowRunID: "run-B", WorkflowStepID: "s1",
	})
	// A standalone job (no provenance) is ignored.
	events.Events.Send(&eventtypes.JobCreateEvent{Id: "job-3", Name: "standalone"})

	waitFor(t, func() bool { return adapter.jobIDFor("s1") == "job-1" }, "step s1 mapped to job-1")
	if adapter.jobIDFor("ghost") != "" {
		t.Error("unknown step should map to empty job id")
	}
}

func TestWorkflowJobLifecycleOpsOnUnmappedStepAreNoOps(t *testing.T) {
	adapter, cleanup := newWorkflowJobLifecycle(&FileMoverServer{}, "run-none")
	defer cleanup()
	// No JobCreateEvent observed for these steps: the ops must be safe no-ops (no panic,
	// no job-manager interaction).
	adapter.Cancel("missing")
	adapter.Pause("missing")
	adapter.Resume("missing")
}

func TestWorkflowJobLifecycleCancelResolvesAndCancelsJob(t *testing.T) {
	runID := "run-cancel"
	adapter, cleanup := newWorkflowJobLifecycle(&FileMoverServer{}, runID)
	defer cleanup()

	// Create a real job in the job manager tagged with this run/step, as the Job executor
	// would, and announce it on the bus.
	profile := &configtypes.TransferProfile{Name: "p"}
	job, err := jobmanagertypes.NewJob(jobmanagertypes.JobConfig{
		Name: "wf job", TransferProfile: profile, WorkflowRunID: runID, WorkflowStepID: "s1",
	})
	if err != nil {
		t.Fatalf("NewJob: %v", err)
	}
	job.SetStatus(jobmanagertypes.JobStatusInProgress)
	if addErr := job_manager.GetInstance().AddJob(job); addErr != nil {
		t.Fatalf("AddJob: %v", addErr)
	}
	// AddJob itself emits the JobCreateEvent the adapter consumes.
	waitFor(t, func() bool { return adapter.jobIDFor("s1") == job.JobId() }, "step s1 mapped")

	adapter.Cancel("s1")
	waitFor(t, func() bool {
		return job_manager.GetInstance().GetJob(job.JobId()).Status() == jobmanagertypes.JobStatusCancelled
	}, "job cancelled via adapter")
}

func TestWorkflowJobLifecyclePauseResumeResolvesJob(t *testing.T) {
	runID := "run-pauseresume"
	adapter, cleanup := newWorkflowJobLifecycle(&FileMoverServer{}, runID)
	defer cleanup()

	profile := &configtypes.TransferProfile{Name: "p"}
	job, err := jobmanagertypes.NewJob(jobmanagertypes.JobConfig{
		Name: "wf job", TransferProfile: profile, WorkflowRunID: runID, WorkflowStepID: "s1",
	})
	if err != nil {
		t.Fatalf("NewJob: %v", err)
	}
	job.SetStatus(jobmanagertypes.JobStatusInProgress)
	if addErr := job_manager.GetInstance().AddJob(job); addErr != nil {
		t.Fatalf("AddJob: %v", addErr)
	}
	waitFor(t, func() bool { return adapter.jobIDFor("s1") == job.JobId() }, "step s1 mapped")

	adapter.Pause("s1")
	waitFor(t, func() bool {
		return job_manager.GetInstance().GetJob(job.JobId()).Status() == jobmanagertypes.JobStatusPaused
	}, "job paused via adapter")

	adapter.Resume("s1")
	waitFor(t, func() bool {
		return job_manager.GetInstance().GetJob(job.JobId()).Status() == jobmanagertypes.JobStatusInProgress
	}, "job resumed via adapter")
}

func TestToProtoWorkflowRunMapsStepsAndStatus(t *testing.T) {
	run := &workflow.WorkflowRun{
		RunID:  "r1",
		Name:   "nightly",
		Status: workflow.RunRunning,
		Steps: []workflow.WorkflowStep{
			{StepID: "s1", Name: "ingest", Type: "Job", Status: workflow.StepSucceeded, JobID: "j1"},
			{StepID: "s2", Name: "wait", Type: "Sleep", Status: workflow.StepFailed, Error: "boom"},
		},
	}
	pb := toProtoWorkflowRun(run)
	if pb.GetRunId() != "r1" || pb.GetName() != "nightly" {
		t.Fatalf("run id/name = %q/%q", pb.GetRunId(), pb.GetName())
	}
	if pb.GetStatus() != fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_RUNNING {
		t.Errorf("run status = %v", pb.GetStatus())
	}
	if len(pb.GetSteps()) != 2 {
		t.Fatalf("steps = %d, want 2", len(pb.GetSteps()))
	}
	if pb.GetSteps()[0].GetJobId() != "j1" ||
		pb.GetSteps()[0].GetStatus() != fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SUCCEEDED {
		t.Errorf("step 0 = %+v", pb.GetSteps()[0])
	}
	if pb.GetSteps()[1].GetError() != "boom" ||
		pb.GetSteps()[1].GetStatus() != fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_FAILED {
		t.Errorf("step 1 = %+v", pb.GetSteps()[1])
	}
}

func TestToProtoRunAndStepStatusMapping(t *testing.T) {
	runCases := map[workflow.RunStatus]fmev1.WorkflowRunStatus{
		workflow.RunPending:   fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PENDING,
		workflow.RunRunning:   fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_RUNNING,
		workflow.RunPaused:    fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_PAUSED,
		workflow.RunSucceeded: fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_SUCCEEDED,
		workflow.RunFailed:    fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_FAILED,
		workflow.RunCancelled: fmev1.WorkflowRunStatus_WORKFLOW_RUN_STATUS_CANCELLED,
	}
	for s, want := range runCases {
		if got := toProtoRunStatus(s); got != want {
			t.Errorf("toProtoRunStatus(%s) = %v, want %v", s, got, want)
		}
	}
	stepCases := map[workflow.StepStatus]fmev1.WorkflowStepStatus{
		workflow.StepPending:   fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_PENDING,
		workflow.StepRunning:   fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_RUNNING,
		workflow.StepSucceeded: fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SUCCEEDED,
		workflow.StepFailed:    fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_FAILED,
		workflow.StepSkipped:   fmev1.WorkflowStepStatus_WORKFLOW_STEP_STATUS_SKIPPED,
	}
	for s, want := range stepCases {
		if got := toProtoStepStatus(s); got != want {
			t.Errorf("toProtoStepStatus(%s) = %v, want %v", s, got, want)
		}
	}
}
