package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
)

// ListWorkflowRuns returns every workflow run the daemon has recorded (persisted run
// state, newest status included). A run links its Job steps' jobs by workflow_run_id, so
// the GUI can scope ListJobs / ListEvents to a run from this list.
func (*FileMoverServer) ListWorkflowRuns(
	_ context.Context,
	_ *connect.Request[fmev1.ListWorkflowRunsRequest],
) (*connect.Response[fmev1.ListWorkflowRunsResponse], error) {
	mgr, err := workflowManager()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	runs, listErr := mgr.List()
	if listErr != nil {
		return nil, connect.NewError(connect.CodeInternal, listErr)
	}
	out := make([]*fmev1.WorkflowRun, 0, len(runs))
	for _, r := range runs {
		out = append(out, toProtoWorkflowRun(r))
	}
	return connect.NewResponse(&fmev1.ListWorkflowRunsResponse{Runs: out}), nil
}
