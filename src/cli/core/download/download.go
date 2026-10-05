package download

import (
	"fmt"
	"time"

	"github.com/awslabs/filemoverexpress/core"
	"github.com/awslabs/filemoverexpress/core/job_manager"
	"github.com/awslabs/filemoverexpress/events"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	"github.com/awslabs/filemoverexpress/types/jobmanagertypes"
)

// failJob marks the job errored and emits a JobErrorEvent carrying the job id, so any
// consumer waiting on the job's terminal event (the workflow executor, transfer stats)
// is unblocked. A job-start failure that only logged an error used to leave such a
// consumer waiting forever (the workflow run stuck "Running").
func failJob(job *jobmanagertypes.Job, err error) {
	job.SetStatus(jobmanagertypes.JobStatusError)
	events.Events.Send(&eventtypes.JobErrorEvent{
		Id:        job.JobId(),
		Name:      job.Name(),
		ErrorTime: time.Now(),
		Err:       err,
	})
}

// Downloader is the main entry point for the S3 downloader functionality
func Downloader(job *jobmanagertypes.Job) {
	transferProfile := job.TransferProfile()
	jobManager := job_manager.GetInstance()
	_, sessErr := jobManager.GetS3Manager(transferProfile)
	if sessErr != nil {
		failJob(job, fmt.Errorf(strFailedEstablishingAwsSession, sessErr))
		return
	}

	err := jobManager.AddJob(job)
	if err != nil {
		failJob(job, fmt.Errorf(strErrorCreatingJob, err))
		return
	}

	if err = core.CreateDirIfDoesNotExists(job.Destination()); err != nil {
		failJob(job, fmt.Errorf("failed to create destination directory: %w", err))
		if delErr := jobManager.DeleteJob(job.JobId()); delErr != nil {
			events.Events.Warn(strErrorDeletingJob, delErr)
		}
		return
	}

	jobManager.DownloadJob(job)
}
