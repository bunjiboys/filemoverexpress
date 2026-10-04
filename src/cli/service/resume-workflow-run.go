package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// ResumeWorkflowRun un-gates a paused run and resumes any jobs paused by a
// pause_in_flight_jobs pause. An unknown or already-terminal run is reported in the
// response's error field (success=false).
func (*FileMoverServer) ResumeWorkflowRun(
	_ context.Context,
	req *connect.Request[fmev1.ResumeWorkflowRunRequest],
) (*connect.Response[fmev1.ResumeWorkflowRunResponse], error) {
	runID := req.Msg.GetRunId()
	mgr, err := workflowManager()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if resumeErr := mgr.Resume(runID); resumeErr != nil {
		return connect.NewResponse(&fmev1.ResumeWorkflowRunResponse{
			RunId:   runID,
			Success: false,
			Error:   resumeErr.Error(),
		}), nil
	}
	return connect.NewResponse(&fmev1.ResumeWorkflowRunResponse{RunId: runID, Success: true}), nil
}
