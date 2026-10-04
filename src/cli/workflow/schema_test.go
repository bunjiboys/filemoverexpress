package workflow

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateAgainstSchemaValid(t *testing.T) {
	generic, _, err := Parse([]byte(validYAML), FormatYAML)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := ValidateAgainstSchema(generic); err != nil {
		t.Fatalf("valid document rejected: %v", err)
	}
}

func TestValidateAgainstSchemaRejects(t *testing.T) {
	cases := map[string]string{
		"bad apiVersion": `
apiVersion: wrong
kind: Workflow
spec:
  steps:
    - id: a
      type: Sleep
      with: {duration: 30s}
`,
		"bad kind": `
apiVersion: fme.dev/workflow/v1
kind: NotAWorkflow
spec:
  steps:
    - id: a
      type: Sleep
      with: {duration: 30s}
`,
		"unknown step type": `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Teleport
      with: {}
`,
		"empty steps": `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps: []
`,
		"sleep bad duration": `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Sleep
      with: {duration: not-a-duration}
`,
		"job missing required field": `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Job
      with: {direction: upload, sources: ["/a"]}
`,
		"writeMhl without mhlOutput": `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Checksum
      with: {sources: ["/a"], writeMhl: true}
`,
		"enum param without values": `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  parameters:
    - name: env
      type: enum
  steps:
    - id: a
      type: Sleep
      with: {duration: 1s}
`,
	}
	for name, src := range cases {
		t.Run(name, func(t *testing.T) {
			generic, _, err := Parse([]byte(src), FormatYAML)
			if err != nil {
				return // a parse-level rejection also satisfies "rejected"
			}
			if err := ValidateAgainstSchema(generic); err == nil {
				t.Errorf("expected schema rejection, got nil")
			}
		})
	}
}

// The embedded copy MUST stay byte-identical to the repo-root source of truth, so the
// daemon validates against exactly the schema the builder authors against. This guard
// fails loudly if a format bump updates one but not the other.
func TestEmbeddedSchemaMatchesRoot(t *testing.T) {
	// This test file lives in src/cli/workflow/; the root schema is four levels up.
	rootPath := filepath.Join("..", "..", "..", "schemas", "workflow", "v1.json")
	root, err := os.ReadFile(rootPath)
	if err != nil {
		t.Fatalf("reading root schema %s: %v", rootPath, err)
	}
	if string(root) != string(schemaJSON) {
		t.Fatalf("embedded schema (schema/v1.json) differs from root %s; re-copy the root schema into the package", rootPath)
	}
}

// The embedded schema itself must compile — guards against a corrupt vendored copy.
func TestEmbeddedSchemaCompiles(t *testing.T) {
	if _, err := compileSchema(schemaJSON); err != nil {
		t.Fatalf("embedded schema does not compile: %v", err)
	}
}

func TestCompileSchemaRejectsMalformedJSON(t *testing.T) {
	if _, err := compileSchema([]byte("{not json")); err == nil {
		t.Fatal("expected error for malformed schema JSON")
	}
}

func TestCompileSchemaRejectsUnresolvable(t *testing.T) {
	// A $ref to a fragment that does not exist cannot be resolved.
	if _, err := compileSchema([]byte(`{"$ref": "#/$defs/does-not-exist"}`)); err == nil {
		t.Fatal("expected error resolving a dangling $ref")
	}
}
