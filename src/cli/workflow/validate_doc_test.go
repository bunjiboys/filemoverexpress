package workflow

import (
	"strings"
	"testing"
)

const validRunYAML = `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  parameters:
    - name: day
      type: string
      required: true
  steps:
    - id: a
      type: Sleep
      with: {duration: 1s}
    - id: b
      type: Job
      with:
        direction: upload
        transferProfile: prod
        sources: ["/mnt/${params.day}"]
        destination: "d/${params.day}"
        force: false
      dependsOn: [a]
`

// alwaysProfileOK is a profile checker that accepts every name.
func alwaysProfileOK(string) bool { return true }

func TestValidateValidDocument(t *testing.T) {
	errs := validateSource(t, validRunYAML, map[string]string{"day": "15"}, alwaysProfileOK)
	if len(errs) != 0 {
		t.Fatalf("valid document rejected: %v", errs)
	}
}

func TestValidateSchemaError(t *testing.T) {
	src := `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Teleport
      with: {}
`
	errs := validateSource(t, src, nil, alwaysProfileOK)
	assertKind(t, errs, KindSchema)
}

func TestValidateVersionError(t *testing.T) {
	// A document whose parse succeeds but apiVersion is unsupported is a VERSION error.
	src := `
apiVersion: fme.dev/workflow/v2
kind: Workflow
spec:
  steps:
    - id: a
      type: Sleep
      with: {duration: 1s}
`
	errs := validateSource(t, src, nil, alwaysProfileOK)
	assertKind(t, errs, KindVersion)
}

func TestValidateGraphError(t *testing.T) {
	src := `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  steps:
    - id: a
      type: Sleep
      with: {duration: 1s}
      dependsOn: [ghost]
`
	errs := validateSource(t, src, nil, alwaysProfileOK)
	assertKind(t, errs, KindGraph)
}

func TestValidateParameterError(t *testing.T) {
	// Required param 'day' not supplied -> PARAMETER error.
	errs := validateSource(t, validRunYAML, map[string]string{}, alwaysProfileOK)
	assertKind(t, errs, KindParameter)
}

func TestValidateProfileError(t *testing.T) {
	// All profiles missing -> PROFILE error on the Job step naming 'prod'.
	errs := validateSource(t, validRunYAML, map[string]string{"day": "15"}, func(string) bool { return false })
	assertKind(t, errs, KindProfile)
	for _, e := range errs {
		if e.Kind == KindProfile && e.StepID != "b" {
			t.Errorf("profile error StepID = %q, want b", e.StepID)
		}
	}
}

func TestValidatePathTraversalIsGraphOrProfileFree(t *testing.T) {
	// A ${params.*} that injects a traversal into a path is rejected post-substitution.
	src := `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  parameters:
    - name: p
      type: string
      required: true
  steps:
    - id: a
      type: Job
      with:
        direction: upload
        transferProfile: prod
        sources: ["/mnt"]
        destination: "d/${params.p}"
`
	errs := validateSource(t, src, map[string]string{"p": "../etc"}, alwaysProfileOK)
	assertKind(t, errs, KindSchema) // path safety reported as a schema/shape-level error
}

func TestValidateTraversalInSourcesArray(t *testing.T) {
	// A traversal injected into a sources array element is rejected, exercising the
	// array-recursion path of the resolved-value scan.
	src := `
apiVersion: fme.dev/workflow/v1
kind: Workflow
spec:
  parameters:
    - name: p
      type: string
      required: true
  steps:
    - id: a
      type: Job
      with:
        direction: upload
        transferProfile: prod
        sources: ["/mnt/${params.p}/x"]
        destination: d
`
	errs := validateSource(t, src, map[string]string{"p": "../.."}, alwaysProfileOK)
	assertKind(t, errs, KindSchema)
}

func TestVersionSupported(t *testing.T) {
	if !VersionSupported("fme.dev/workflow/v1") {
		t.Error("v1 should be supported")
	}
	if VersionSupported("fme.dev/workflow/v2") {
		t.Error("v2 should not be supported")
	}
}

// validateSource parses src and runs the full Validate pipeline against it.
func validateSource(t *testing.T, src string, params map[string]string, profileExists func(string) bool) []ValidationError {
	t.Helper()
	generic, doc, err := Parse([]byte(src), FormatYAML)
	if err != nil {
		// A parse-level failure is surfaced as a schema error by Validate's caller; for
		// these tests feed the parsed views, and treat a parse error as a schema finding.
		return []ValidationError{{Kind: KindSchema, Message: err.Error()}}
	}
	return Validate(generic, doc, params, profileExists)
}

func assertKind(t *testing.T, errs []ValidationError, kind ValidationErrorKind) {
	t.Helper()
	for _, e := range errs {
		if e.Kind == kind {
			return
		}
	}
	var kinds []string
	for _, e := range errs {
		kinds = append(kinds, string(e.Kind)+":"+e.Message)
	}
	t.Fatalf("expected a %s error, got: %s", kind, strings.Join(kinds, " | "))
}
