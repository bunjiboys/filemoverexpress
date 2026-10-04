package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// PauseWorkflowRun gates a run's scheduler so no new steps start; pause_in_flight_jobs also
// pauses each in-flight Job step's job (non-Job in-flight steps have no pause primitive and
// run to completion either way). An unknown or already-terminal run is reported in the
// response's error field (success=false).
func (*FileMoverServer) PauseWorkflowRun(
	_ context.Context,
	req *connect.Request[fmev1.PauseWorkflowRunRequest],
) (*connect.Response[fmev1.PauseWorkflowRunResponse], error) {
	runID := req.Msg.GetRunId()
	mgr, err := workflowManager()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if pauseErr := mgr.Pause(runID, req.Msg.GetPauseInFlightJobs()); pauseErr != nil {
		return connect.NewResponse(&fmev1.PauseWorkflowRunResponse{
			RunId:   runID,
			Success: false,
			Error:   pauseErr.Error(),
		}), nil
	}
	return connect.NewResponse(&fmev1.PauseWorkflowRunResponse{RunId: runID, Success: true}), nil
}
