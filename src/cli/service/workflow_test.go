package service

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	fmev1 "github.com/awslabs/filemoverexpress/types/pbtypes/fme/v1"
	"github.com/awslabs/filemoverexpress/workflow"
)

func TestValidateWorkflowValid(t *testing.T) {
	// A Sleep-only document with no parameters and no profiles is valid without any
	// config.
	src := `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Sleep
      with: {duration: 1s}
`
	srv := &FileMoverServer{}
	resp, err := srv.ValidateWorkflow(context.Background(), connect.NewRequest(&fmev1.ValidateWorkflowRequest{
		Document: src,
		Format:   fmev1.WorkflowFormat_WORKFLOW_FORMAT_YAML,
	}))
	if err != nil {
		t.Fatalf("ValidateWorkflow err = %v", err)
	}
	if !resp.Msg.GetValid() {
		t.Fatalf("expected valid, got errors: %v", resp.Msg.GetErrors())
	}
}

func TestValidateWorkflowReportsSchemaError(t *testing.T) {
	src := `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Teleport
      with: {}
`
	srv := &FileMoverServer{}
	resp, err := srv.ValidateWorkflow(context.Background(), connect.NewRequest(&fmev1.ValidateWorkflowRequest{
		Document: src,
		Format:   fmev1.WorkflowFormat_WORKFLOW_FORMAT_YAML,
	}))
	if err != nil {
		t.Fatalf("ValidateWorkflow err = %v", err)
	}
	if resp.Msg.GetValid() {
		t.Fatal("expected invalid for an unknown step type")
	}
	if len(resp.Msg.GetErrors()) == 0 {
		t.Fatal("expected at least one validation error")
	}
}

func TestValidateWorkflowParseErrorIsValidationError(t *testing.T) {
	srv := &FileMoverServer{}
	resp, err := srv.ValidateWorkflow(context.Background(), connect.NewRequest(&fmev1.ValidateWorkflowRequest{
		Document: "{not yaml: [",
		Format:   fmev1.WorkflowFormat_WORKFLOW_FORMAT_YAML,
	}))
	if err != nil {
		t.Fatalf("a parse failure should not be a transport error, got %v", err)
	}
	if resp.Msg.GetValid() {
		t.Fatal("expected invalid for unparseable input")
	}
}

func TestWorkflowFormatMapping(t *testing.T) {
	if workflowFormat(fmev1.WorkflowFormat_WORKFLOW_FORMAT_JSON) != workflow.FormatJSON {
		t.Error("JSON format not mapped")
	}
	if workflowFormat(fmev1.WorkflowFormat_WORKFLOW_FORMAT_YAML) != workflow.FormatYAML {
		t.Error("YAML format not mapped")
	}
	if workflowFormat(fmev1.WorkflowFormat_WORKFLOW_FORMAT_UNSPECIFIED) != workflow.FormatYAML {
		t.Error("unspecified format should default to YAML")
	}
}

func TestWorkflowParamsMapping(t *testing.T) {
	got := workflowParams([]*fmev1.WorkflowParamValue{
		{Name: "a", Value: "1"},
		{Name: "b", Value: "two"},
		{Name: "src", Values: []string{"/x", "/y"}},
	})
	if got.Scalars["a"] != "1" || got.Scalars["b"] != "two" || len(got.Scalars) != 2 {
		t.Errorf("scalar params mapping = %v", got.Scalars)
	}
	if len(got.Lists["src"]) != 2 || got.Lists["src"][0] != "/x" || got.Lists["src"][1] != "/y" {
		t.Errorf("list params mapping = %v", got.Lists)
	}
}

func TestToProtoValidationErrorKindMapping(t *testing.T) {
	cases := map[workflow.ValidationErrorKind]fmev1.WorkflowValidationErrorKind{
		workflow.KindParameter: fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_PARAMETER,
		workflow.KindSchema:    fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_SCHEMA,
		workflow.KindGraph:     fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_GRAPH,
		workflow.KindProfile:   fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_PROFILE,
		workflow.KindVersion:   fmev1.WorkflowValidationErrorKind_WORKFLOW_VALIDATION_ERROR_KIND_VERSION,
	}
	for kind, want := range cases {
		if got := toProtoValidationErrorKind(kind); got != want {
			t.Errorf("toProtoValidationErrorKind(%s) = %v, want %v", kind, got, want)
		}
	}
}
