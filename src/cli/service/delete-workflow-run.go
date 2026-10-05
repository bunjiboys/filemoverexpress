package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// DeleteWorkflowRun removes a terminal run's record from the persisted store. Only a
// finished run (SUCCEEDED / FAILED / CANCELLED) can be deleted; an unknown id or a run that
// is still PENDING / RUNNING / PAUSED is reported in the response's error field
// (success=false) rather than as a transport error, matching the per-run success/error
// response shape of the other workflow lifecycle RPCs.
func (*FileMoverServer) DeleteWorkflowRun(
	_ context.Context,
	req *connect.Request[fmev1.DeleteWorkflowRunRequest],
) (*connect.Response[fmev1.DeleteWorkflowRunResponse], error) {
	runID := req.Msg.GetRunId()
	mgr, err := workflowManager()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if deleteErr := mgr.Delete(runID); deleteErr != nil {
		return connect.NewResponse(&fmev1.DeleteWorkflowRunResponse{
			RunId:   runID,
			Success: false,
			Error:   deleteErr.Error(),
		}), nil
	}
	return connect.NewResponse(&fmev1.DeleteWorkflowRunResponse{RunId: runID, Success: true}), nil
}
