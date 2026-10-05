package workflow

// ValidationErrorKind categorizes a validation failure so a client can route it (format
// doc + WorkflowValidationErrorKind proto): a parameter error to its form field, a
// document-level error to a banner.
const (
	KindParameter ValidationErrorKind = "PARAMETER"
	KindSchema    ValidationErrorKind = "SCHEMA"
	KindGraph     ValidationErrorKind = "GRAPH"
	KindProfile   ValidationErrorKind = "PROFILE"
	KindVersion   ValidationErrorKind = "VERSION"
)

type (
	// ValidationErrorKind is the category of a ValidationError.
	ValidationErrorKind string

	// ValidationError is one validation failure. Parameter names the offending parameter
	// for KindParameter; StepID names the step for a step-scoped error (dangling
	// dependsOn, missing profile, bad path); both are empty for a document-level error.
	ValidationError struct {
		Kind      ValidationErrorKind
		Parameter string
		StepID    string
		Message   string
	}
)

// VersionSupported reports whether the daemon can execute a document of the given
// apiVersion. v1 is the only supported version; a higher major is rejected with a VERSION
// error rather than half-run (format doc "Versioning").
func VersionSupported(apiVersion string) bool {
	return apiVersion == APIVersion
}

// Validate runs the full pre-run validation pipeline a document must pass before the
// daemon will execute it, returning every failure found (empty when the document is
// valid). It is the single gate shared by the RunWorkflow / ValidateWorkflow handlers and
// the `fme workflow validate` CLI, so authoring and execution cannot drift.
//
// generic is the parsed-to-any view (for schema validation) and doc is the typed view;
// both come from Parse. params are the caller-supplied values; profileExists resolves a
// transfer-profile name against the daemon's config (injected so this stays pure and
// testable). The checks run in dependency order: version, then schema, then the structural
// graph rules, then parameter resolution, then post-substitution path safety and profile
// preflight. A failure in an earlier phase does not suppress later phases, so the caller
// sees every problem at once.
func Validate(generic any, doc Document, params ParamInputs, profileExists func(string) bool) []ValidationError {
	var errs []ValidationError
	errs = append(errs, versionErrors(doc)...)
	errs = append(errs, schemaErrors(generic)...)
	errs = append(errs, graphErrors(doc)...)

	resolved, paramErrs := resolveSteps(doc, params)
	errs = append(errs, paramErrs...)
	errs = append(errs, pathSafetyErrors(resolved)...)
	errs = append(errs, parameterProfileErrors(doc, params, profileExists)...)
	errs = append(errs, profileErrors(doc, resolved, profileExists)...)
	return errs
}

// versionErrors reports a VERSION error when the document's apiVersion is unsupported.
func versionErrors(doc Document) []ValidationError {
	if VersionSupported(doc.APIVersion) {
		return nil
	}
	return []ValidationError{{
		Kind:    KindVersion,
		Message: "unsupported apiVersion: " + doc.APIVersion,
	}}
}

// schemaErrors runs JSON Schema validation, mapping a failure to a SCHEMA error.
func schemaErrors(generic any) []ValidationError {
	if err := ValidateAgainstSchema(generic); err != nil {
		return []ValidationError{{Kind: KindSchema, Message: err.Error()}}
	}
	return nil
}

// graphErrors runs the structural + DAG rules, mapping each to a GRAPH error.
func graphErrors(doc Document) []ValidationError {
	var errs []ValidationError
	for _, msg := range ValidateStructure(doc) {
		errs = append(errs, ValidationError{Kind: KindGraph, Message: msg})
	}
	return errs
}

// resolveSteps resolves parameters into every step's with (merging defaults), returning
// the per-step resolved payloads and any PARAMETER errors. Substitution errors (resolution
// failures, unknown references) are reported as PARAMETER errors.
func resolveSteps(doc Document, params ParamInputs) (map[string]map[string]any, []ValidationError) {
	resolved := make(map[string]map[string]any, len(doc.Spec.Steps))
	var errs []ValidationError
	for i := range doc.Spec.Steps {
		step := doc.Spec.Steps[i]
		out, resolveErrs := ResolveWith(step.With, doc.Spec.Defaults, doc.Spec.Parameters, params)
		resolved[step.ID] = out
		for _, msg := range resolveErrs {
			errs = append(errs, ValidationError{Kind: KindParameter, StepID: step.ID, Message: msg})
		}
	}
	return resolved, errs
}

// resolveDocument returns a copy of doc whose every step's `with` has been resolved
// (spec.defaults merged in, ${params.*} substituted) with the given inputs. It is used on
// the EXECUTION path so the engine's executors read resolved values rather than literal
// ${params.*} templates. Validation (which runs the same resolution to check path safety
// and profiles) has already proven the resolution is clean, so any residual substitution
// errors are dropped here — they were already reported as PARAMETER errors by Validate and
// would have failed the run before it started. The envelope fields (id/name/type/
// dependsOn/continueOnError) are never templated and are copied unchanged; the original
// doc is not mutated (a fresh steps slice is built).
func resolveDocument(doc Document, params ParamInputs) Document {
	out := doc
	out.Spec.Steps = make([]Step, len(doc.Spec.Steps))
	for i := range doc.Spec.Steps {
		step := doc.Spec.Steps[i]
		resolvedWith, _ := ResolveWith(step.With, doc.Spec.Defaults, doc.Spec.Parameters, params)
		step.With = resolvedWith
		out.Spec.Steps[i] = step
	}
	return out
}

// pathSafetyErrors checks every string value in each resolved step payload for a traversal
// segment introduced by substitution (format doc "Path safety"), reporting a SCHEMA error
// (a shape/safety failure) naming the step.
func pathSafetyErrors(resolved map[string]map[string]any) []ValidationError {
	var errs []ValidationError
	for stepID, with := range resolved {
		for _, value := range stringValues(with) {
			if err := CheckPathSafety(value); err != nil {
				errs = append(errs, ValidationError{Kind: KindSchema, StepID: stepID, Message: err.Error()})
			}
		}
	}
	return errs
}

// stringValues collects every string scalar in a resolved payload, recursing arrays and
// nested maps, so path safety can inspect each.
func stringValues(value any) []string {
	switch v := value.(type) {
	case string:
		return []string{v}
	case map[string]any:
		var out []string
		for _, item := range v {
			out = append(out, stringValues(item)...)
		}
		return out
	case []any:
		var out []string
		for _, item := range v {
			out = append(out, stringValues(item)...)
		}
		return out
	default:
		return nil
	}
}

// profileErrors runs the transfer-profile preflight: every Job and InventoryReport step
// names a transferProfile that must exist on the daemon (format doc "Portability"). A
// missing profile is a PROFILE error naming the step.
func profileErrors(doc Document, resolved map[string]map[string]any, profileExists func(string) bool) []ValidationError {
	var errs []ValidationError
	for i := range doc.Spec.Steps {
		step := doc.Spec.Steps[i]
		if step.Type != StepJob && step.Type != StepInventoryReport {
			continue
		}
		name := withString(resolved[step.ID], "transferProfile")
		if name != "" && !profileExists(name) {
			errs = append(errs, ValidationError{
				Kind:    KindProfile,
				StepID:  step.ID,
				Message: "unknown transfer profile: " + name,
			})
		}
	}
	return errs
}

// parameterProfileErrors runs the transfer-profile preflight at the PARAMETER level: a
// transfer_profile parameter resolves to a profile name that must exist on the daemon.
// Unlike profileErrors (which checks a step's resolved transferProfile field and reports
// a step-scoped PROFILE error), this reports a KindParameter error naming the offending
// parameter so a client can route it to that parameter's form field. An empty resolved
// value (an unsupplied, non-required parameter) is not checked, mirroring the step-field
// guard; a resolution failure is already reported by resolveSteps, so only parameters
// that resolve cleanly to a non-empty string are checked here.
func parameterProfileErrors(doc Document, params ParamInputs, profileExists func(string) bool) []ValidationError {
	set, _ := resolveParamsWith(doc.Spec.Parameters, params)
	var errs []ValidationError
	for i := range doc.Spec.Parameters {
		spec := doc.Spec.Parameters[i]
		if spec.Type != ParamTransferProfile {
			continue
		}
		name, ok := set[spec.Name].value.(string)
		if !ok || name == "" || profileExists(name) {
			continue
		}
		errs = append(errs, ValidationError{
			Kind:      KindParameter,
			Parameter: spec.Name,
			Message:   "unknown transfer profile: " + name,
		})
	}
	return errs
}
