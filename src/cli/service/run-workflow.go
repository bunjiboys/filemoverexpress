package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// RunWorkflow submits a workflow document for execution. The daemon validates it
// (resolving the supplied parameters); on any validation failure the run is rejected with
// accepted=false and the failures, and no run is created. On acceptance it creates and
// persists a run, starts executing it in the background, and returns the run id
// immediately; progress follows on the event stream and the job surface, scoped by the run
// id.
func (*FileMoverServer) RunWorkflow(
	_ context.Context,
	req *connect.Request[fmev1.RunWorkflowRequest],
) (*connect.Response[fmev1.RunWorkflowResponse], error) {
	mgr, err := workflowManager()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	runID, verrs, startErr := mgr.Start(
		[]byte(req.Msg.GetDocument()),
		workflowFormat(req.Msg.GetFormat()),
		workflowParams(req.Msg.GetParams()),
	)
	if startErr != nil {
		return nil, connect.NewError(connect.CodeInternal, startErr)
	}
	if len(verrs) > 0 {
		return connect.NewResponse(&fmev1.RunWorkflowResponse{
			Accepted: false,
			Errors:   toProtoValidationErrors(verrs),
		}), nil
	}
	return connect.NewResponse(&fmev1.RunWorkflowResponse{
		Accepted: true,
		RunId:    runID,
	}), nil
}
