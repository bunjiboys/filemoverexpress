package workflow

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/google/jsonschema-go/jsonschema"
)

// schemaJSON is the published workflow JSON Schema (draft 2020-12), vendored from the
// repo-root source of truth at schemas/workflow/v1.json. //go:embed can only reach
// files within this package's own tree, so the schema is copied into
// workflow/schema/v1.json and kept byte-identical to the root (guarded by a test). The
// daemon validates against the SAME schema the builder authors against, so the two
// cannot drift.
//
// resolvedSchema is the parsed+resolved schema, compiled once on first use. Resolution
// is comparatively expensive and the schema never changes at runtime, so it is cached.
var (
	//go:embed schema/v1.json
	schemaJSON []byte

	resolvedSchema *jsonschema.Resolved
	resolveOnce    sync.Once
	resolveErr     error
)

// loadSchema parses and resolves the embedded schema exactly once. A failure here is a
// programming/build error (the embedded schema is malformed), not a user error, so it
// is surfaced as an error from ValidateAgainstSchema rather than panicking.
func loadSchema() (*jsonschema.Resolved, error) {
	resolveOnce.Do(func() {
		resolvedSchema, resolveErr = compileSchema(schemaJSON)
	})
	return resolvedSchema, resolveErr
}

// compileSchema parses and resolves schema bytes into a validator. Separated from
// loadSchema (which caches the embedded schema) so its two error branches — malformed
// JSON and an unresolvable schema — are reachable in tests with crafted inputs, rather
// than being dead code gated behind the always-valid embedded constant.
func compileSchema(raw []byte) (*jsonschema.Resolved, error) {
	var s jsonschema.Schema
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("workflow: parsing embedded schema: %w", err)
	}
	resolved, err := s.Resolve(nil)
	if err != nil {
		return nil, fmt.Errorf("workflow: resolving embedded schema: %w", err)
	}
	return resolved, nil
}

// ValidateAgainstSchema validates an already-parsed document value (the result of
// unmarshalling the workflow JSON/YAML into generic Go values — map[string]any etc.)
// against the embedded draft-2020-12 schema. It returns nil when the instance conforms,
// or a single error describing the first conformance failure. Structural rules the
// schema cannot express (dependsOn integrity, acyclicity, id uniqueness) are checked
// separately by the validator; this is the shape/enum/constraint gate only.
func ValidateAgainstSchema(instance any) error {
	resolved, err := loadSchema()
	if err != nil {
		// COVERAGE: justified-unreachable defensive branch. loadSchema compiles the
		// embedded schema constant (schema/v1.json), which TestEmbeddedSchemaCompiles
		// proves always resolves; it therefore never returns an error at runtime. The
		// error path is kept so a future corruption of the embedded schema surfaces as a
		// clear error instead of a nil-pointer panic, and compileSchema's own error
		// branches ARE covered directly. See the implementation plan.
		return err
	}
	if err := resolved.Validate(instance); err != nil {
		return fmt.Errorf("workflow: schema validation: %w", err)
	}
	return nil
}
