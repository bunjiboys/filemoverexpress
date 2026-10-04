package service

import (
	"context"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
	"github.com/awslabs/filemoverexpress/workflow"
)

// ValidateWorkflow validates a submitted workflow document (resolved with the supplied
// parameters) without executing it, running the same schema + structural + reference +
// parameter checks the daemon applies before a run. It never starts a run; the GUI uses it
// for a "Validate" action distinct from "Run".
func (*FileMoverServer) ValidateWorkflow(
	_ context.Context,
	req *connect.Request[fmev1.ValidateWorkflowRequest],
) (*connect.Response[fmev1.ValidateWorkflowResponse], error) {
	errs := validateWorkflowDocument(
		[]byte(req.Msg.GetDocument()),
		workflowFormat(req.Msg.GetFormat()),
		workflowParams(req.Msg.GetParams()),
	)
	return connect.NewResponse(&fmev1.ValidateWorkflowResponse{
		Valid:  len(errs) == 0,
		Errors: toProtoValidationErrors(errs),
	}), nil
}

// validateWorkflowDocument parses and validates a document, returning every validation
// failure (a parse failure is surfaced as a schema-level validation error, not a transport
// error, so the GUI shows it in the same place as other validation findings).
func validateWorkflowDocument(src []byte, format workflow.Format, params workflow.ParamInputs) []workflow.ValidationError {
	generic, doc, err := workflow.Parse(src, format)
	if err != nil {
		return []workflow.ValidationError{{Kind: workflow.KindSchema, Message: err.Error()}}
	}
	return workflow.Validate(generic, doc, params, transferProfileExists)
}
