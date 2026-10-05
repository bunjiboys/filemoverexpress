// Package workflow implements the daemon-side workflow engine: parsing, validation,
// parameter resolution, DAG scheduling, and in-process step execution for an FME
// Workflow document (see docs/designs/workflows/Workflow-File-Format.md). It is an
// orchestration layer that sits ABOVE the transfer-engine primitives in core/*; it
// composes upload/download, core/checksums, and inventory rather than being one of them.
package workflow

const (
	// APIVersion and Kind are the only accepted document identity values for v1. A
	// document whose apiVersion/kind differ is rejected by schema validation.
	APIVersion = "fme.dev/workflow/v1"
	Kind       = "Workflow"

	ParamString ParameterType = "string"
	ParamInt    ParameterType = "int"
	ParamFloat  ParameterType = "float"
	ParamBool   ParameterType = "bool"
	ParamEnum   ParameterType = "enum"
	// ParamTransferProfile is a scalar type whose value is the name of a TransferProfile
	// configured on the executing daemon. It resolves and coerces exactly like a string
	// (the value IS the profile name) and has an empty form; what distinguishes it is
	// validation: the resolved value is checked against the daemon's live profile set at
	// validate time (a KindParameter error names the parameter), and the runner GUI
	// renders it as a transfer-profile dropdown rather than a free-text field instead of
	// hardcoding the choices in an enum's `values`. See
	// docs/designs/workflows/Workflow-File-Format.md.
	ParamTransferProfile ParameterType = "transfer_profile"
	// ParamStringArray is the one list parameter type in v1: it resolves to a []string
	// so a whole-value reference can fill a list `with` position such as a Job or
	// Checksum step's `sources`. Its `pattern` constraint, when set, is applied to every
	// element. See docs/designs/workflows/Workflow-File-Format.md.
	ParamStringArray ParameterType = "string_array"

	StepJob             StepType = "Job"
	StepChecksum        StepType = "Checksum"
	StepSleep           StepType = "Sleep"
	StepInventoryReport StepType = "InventoryReport"

	RunPending   RunStatus = "PENDING"
	RunRunning   RunStatus = "RUNNING"
	RunPaused    RunStatus = "PAUSED"
	RunSucceeded RunStatus = "SUCCEEDED"
	RunFailed    RunStatus = "FAILED"
	RunCancelled RunStatus = "CANCELLED"

	StepPending   StepStatus = "PENDING"
	StepRunning   StepStatus = "RUNNING"
	StepSucceeded StepStatus = "SUCCEEDED"
	StepFailed    StepStatus = "FAILED"
	StepSkipped   StepStatus = "SKIPPED"
)

type (
	// ParameterType is the declared type of a workflow parameter. It governs coercion
	// and which constraint fields are meaningful (format doc "Parameter types").
	ParameterType string

	// StepType is the discriminator selecting a step's payload schema and executor.
	StepType string

	// RunStatus is a workflow run's overall status (format doc "Run and step status
	// model"). SUCCEEDED/FAILED/CANCELLED are terminal.
	RunStatus string

	// StepStatus is a step's status within a run (format doc "Run and step status
	// model").
	StepStatus string

	// Document is the parsed form of a workflow file. Its shape mirrors
	// schemas/workflow/v1.json exactly: the envelope (apiVersion/kind/metadata) plus the
	// spec (parameters, defaults, steps). `with` payloads are kept as raw maps here; a
	// step-type-specific view is produced by the executors, not at parse time, so the
	// envelope stays generic (format doc "The step envelope").
	Document struct {
		APIVersion string    `json:"apiVersion" yaml:"apiVersion"`
		Kind       string    `json:"kind"       yaml:"kind"`
		Metadata   *Metadata `json:"metadata,omitempty" yaml:"metadata,omitempty"`
		Spec       Spec      `json:"spec"       yaml:"spec"`
	}

	// Metadata is advisory document-level identity. Labels are a string-to-string map
	// and do not affect scheduling or status (format doc "File shape").
	Metadata struct {
		Name        string            `json:"name,omitempty"        yaml:"name,omitempty"`
		Description string            `json:"description,omitempty" yaml:"description,omitempty"`
		Labels      map[string]string `json:"labels,omitempty"      yaml:"labels,omitempty"`
	}

	// Spec holds the declared parameters, the defaults merged into each step's `with`,
	// and the steps themselves. Steps is non-empty in a valid document (schema
	// minItems: 1).
	Spec struct {
		Parameters []Parameter    `json:"parameters,omitempty" yaml:"parameters,omitempty"`
		Defaults   map[string]any `json:"defaults,omitempty"   yaml:"defaults,omitempty"`
		Steps      []Step         `json:"steps"                yaml:"steps"`
	}

	// Parameter is a declared, typed, constrained input referenced as ${params.name} in
	// step `with` values. Default is kept as `any` because its concrete type depends on
	// Type; the validator checks it against Type. Constraint fields are type-scoped:
	// Pattern (string), Min/Max (int/float), Values (enum).
	Parameter struct {
		Name     string        `json:"name"               yaml:"name"`
		Type     ParameterType `json:"type"               yaml:"type"`
		Required bool          `json:"required,omitempty" yaml:"required,omitempty"`
		Default  any           `json:"default,omitempty"  yaml:"default,omitempty"`
		Pattern  string        `json:"pattern,omitempty"  yaml:"pattern,omitempty"`
		Min      *float64      `json:"min,omitempty"      yaml:"min,omitempty"`
		Max      *float64      `json:"max,omitempty"      yaml:"max,omitempty"`
		Values   []string      `json:"values,omitempty"   yaml:"values,omitempty"`
	}

	// Step is the generic step envelope (format doc "The step envelope"): the same shape
	// regardless of Type, with the type-specific payload carried in With as a raw map.
	// DependsOn and ID are never templated, so they are plain strings resolved before
	// any substitution.
	Step struct {
		ID              string         `json:"id"                        yaml:"id"`
		Name            string         `json:"name,omitempty"            yaml:"name,omitempty"`
		Type            StepType       `json:"type"                      yaml:"type"`
		With            map[string]any `json:"with"                      yaml:"with"`
		DependsOn       []string       `json:"dependsOn,omitempty"       yaml:"dependsOn,omitempty"`
		ContinueOnError bool           `json:"continueOnError,omitempty" yaml:"continueOnError,omitempty"`
	}
)

// Terminal reports whether a run status is final (no further transitions).
func (s RunStatus) Terminal() bool {
	return s == RunSucceeded || s == RunFailed || s == RunCancelled
}

// Terminal reports whether a step status is final.
func (s StepStatus) Terminal() bool {
	return s == StepSucceeded || s == StepFailed || s == StepSkipped
}
