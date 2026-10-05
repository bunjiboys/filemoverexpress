package workflow

import (
	"strings"
	"testing"
)

const validYAML = `
apiVersion: fme.dev/workflow/v1
kind: Workflow
metadata:
  name: nightly
  labels:
    show: project-x
spec:
  parameters:
    - name: day
      type: string
      required: true
  defaults:
    force: false
  steps:
    - id: ingest
      name: Ingest
      type: Upload
      with:
        transferProfile: prod
        sources: ["/a"]
        destination: dest
      continueOnError: false
    - id: verify
      type: Checksum
      with:
        sources: ["/a"]
      dependsOn: [ingest]
`

const validJSON = `{
  "apiVersion": "fme.dev/workflow/v1",
  "kind": "Workflow",
  "spec": { "steps": [ { "id": "s", "type": "Sleep", "with": { "duration": "5m" } } ] }
}`

func TestParseYAML(t *testing.T) {
	generic, doc, err := Parse([]byte(validYAML), FormatYAML)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if generic == nil {
		t.Fatal("generic value is nil")
	}
	if doc.APIVersion != APIVersion || doc.Kind != Kind {
		t.Fatalf("envelope: %q/%q", doc.APIVersion, doc.Kind)
	}
	if doc.Metadata == nil || doc.Metadata.Name != "nightly" || doc.Metadata.Labels["show"] != "project-x" {
		t.Fatalf("metadata: %+v", doc.Metadata)
	}
	if len(doc.Spec.Parameters) != 1 || doc.Spec.Parameters[0].Type != ParamString || !doc.Spec.Parameters[0].Required {
		t.Fatalf("parameters: %+v", doc.Spec.Parameters)
	}
	if len(doc.Spec.Steps) != 2 {
		t.Fatalf("steps: %d", len(doc.Spec.Steps))
	}
	if doc.Spec.Steps[0].Type != StepUpload || doc.Spec.Steps[0].Name != "Ingest" {
		t.Fatalf("step 0: %+v", doc.Spec.Steps[0])
	}
	if got := doc.Spec.Steps[1].DependsOn; len(got) != 1 || got[0] != "ingest" {
		t.Fatalf("dependsOn: %v", got)
	}
	if doc.Spec.Steps[0].With["transferProfile"] != "prod" {
		t.Fatalf("with payload not preserved: %+v", doc.Spec.Steps[0].With)
	}
}

func TestParseJSON(t *testing.T) {
	_, doc, err := Parse([]byte(validJSON), FormatJSON)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(doc.Spec.Steps) != 1 || doc.Spec.Steps[0].Type != StepSleep {
		t.Fatalf("steps: %+v", doc.Spec.Steps)
	}
}

func TestParseMalformedYAML(t *testing.T) {
	_, _, err := Parse([]byte("apiVersion: [unclosed"), FormatYAML)
	if err == nil {
		t.Fatal("expected error for malformed YAML")
	}
	if !strings.Contains(err.Error(), "parsing yaml") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestParseMalformedJSON(t *testing.T) {
	_, _, err := Parse([]byte("{not json"), FormatJSON)
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
	if !strings.Contains(err.Error(), "parsing json") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestParseUnknownFieldRejected(t *testing.T) {
	src := `{
      "apiVersion": "fme.dev/workflow/v1",
      "kind": "Workflow",
      "bogus": true,
      "spec": { "steps": [ { "id": "s", "type": "Sleep", "with": {} } ] }
    }`
	_, _, err := Parse([]byte(src), FormatJSON)
	if err == nil {
		t.Fatal("expected error for unknown field")
	}
	if !strings.Contains(err.Error(), "decoding document") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestParseUnknownFormat(t *testing.T) {
	_, _, err := Parse([]byte("x"), Format("toml"))
	if err == nil {
		t.Fatal("expected error for unknown format")
	}
	if !strings.Contains(err.Error(), "unknown format") {
		t.Errorf("unexpected error: %v", err)
	}
}
