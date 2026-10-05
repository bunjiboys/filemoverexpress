package upload

import (
	"fmt"
	"path/filepath"
	"time"

	"github.com/awslabs/filemoverexpress/core"
	"github.com/awslabs/filemoverexpress/core/job_manager"
	"github.com/awslabs/filemoverexpress/events"
	"github.com/awslabs/filemoverexpress/types/eventtypes"
	"github.com/awslabs/filemoverexpress/types/jobmanagertypes"
	"github.com/awslabs/filemoverexpress/utils"
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

func Uploader(job *jobmanagertypes.Job) {
	transferProfile := job.TransferProfile()
	jobManager := job_manager.GetInstance()
	_, sessErr := jobManager.GetS3Manager(transferProfile)
	if sessErr != nil {
		failJob(job, fmt.Errorf(strFailedEstablishingAwsSession, sessErr))
		return
	}
	basePath := job.UploadBasePath()
	if basePath != "" && !filepath.IsAbs(basePath) {
		failJob(job, fmt.Errorf(strBasePathNotAbsolute, basePath))
		return
	}

	job.SetDestination(utils.CleanPrefix("/", job.Destination()))

	err := core.CheckLimits()
	if err != nil {
		failJob(job, fmt.Errorf(strFailedIncreasingMaxOpenFiles, err))
		return
	}

	err = jobManager.AddJob(job)
	if err != nil {
		failJob(job, fmt.Errorf(strErrorCreatingJob, err))
		return
	}
	var absoluteFilePathSources []string
	for _, source := range job.Sources() {
		if !filepath.IsAbs(source) {
			absoluteFilePathSources = append(absoluteFilePathSources, filepath.Join(basePath, source))
		} else {
			absoluteFilePathSources = append(absoluteFilePathSources, source)
		}
	}
	job.SetSources(absoluteFilePathSources)

	jobManager.UploadJob(job)
}
