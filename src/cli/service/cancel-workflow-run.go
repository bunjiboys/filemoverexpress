package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// CancelWorkflowRun cancels a whole run: it stops scheduling, skips not-yet-started steps,
// and cancels in-flight jobs. An unknown or already-terminal run is reported in the
// response's error field (success=false) rather than as a transport error, matching the
// per-run success/error response shape of the job lifecycle RPCs.
func (*FileMoverServer) CancelWorkflowRun(
	_ context.Context,
	req *connect.Request[fmev1.CancelWorkflowRunRequest],
) (*connect.Response[fmev1.CancelWorkflowRunResponse], error) {
	runID := req.Msg.GetRunId()
	mgr, err := workflowManager()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if cancelErr := mgr.Cancel(runID); cancelErr != nil {
		return connect.NewResponse(&fmev1.CancelWorkflowRunResponse{
			RunId:   runID,
			Success: false,
			Error:   cancelErr.Error(),
		}), nil
	}
	return connect.NewResponse(&fmev1.CancelWorkflowRunResponse{RunId: runID, Success: true}), nil
}
