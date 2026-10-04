package workflow

import (
	"bytes"
	"encoding/json"
	"fmt"

	"gopkg.in/yaml.v3"
)

const (
	FormatYAML Format = "yaml"
	FormatJSON Format = "json"
)

// Format is the input encoding of a workflow document. YAML is accepted as input; JSON
// is canonical (format doc, decision 1). Both parse to the same Document.
type Format string

// Parse decodes workflow source text in the given format into both a generic value
// (suitable for schema validation via ValidateAgainstSchema) and a typed Document.
//
// The generic value is returned so the caller can run schema validation against the
// raw shape BEFORE trusting the typed struct — schema validation catches a bad enum or
// a wrong-typed field that would otherwise be silently zero-valued in the struct. Both
// views come from the same canonical JSON bytes, so they cannot disagree.
//
// YAML is normalized to JSON first (yaml.v3 -> any -> JSON) so there is a single
// canonical representation and one code path feeding both the schema validator and the
// struct decoder.
func Parse(src []byte, format Format) (generic any, doc Document, err error) {
	canonical, err := toCanonicalJSON(src, format)
	if err != nil {
		return nil, Document{}, err
	}

	if err := json.Unmarshal(canonical, &generic); err != nil {
		// COVERAGE: justified-unreachable defensive branch. `canonical` is the output of
		// toCanonicalJSON, which produced it via json.Marshal, so it is always valid JSON
		// and this unmarshal cannot fail on any input Parse accepts. Kept as a defensive
		// error (not a panic) rather than silently ignored; it is intentionally not
		// covered because exercising it would require feeding invalid bytes that
		// toCanonicalJSON cannot produce. See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return nil, Document{}, fmt.Errorf("workflow: decoding canonical json: %w", err)
	}

	dec := json.NewDecoder(bytes.NewReader(canonical))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&doc); err != nil {
		return generic, Document{}, fmt.Errorf("workflow: decoding document: %w", err)
	}

	return generic, doc, nil
}

// toCanonicalJSON converts source text in the given format to canonical JSON bytes. For
// JSON input it validates and compacts; for YAML it decodes to a generic value and
// re-encodes as JSON. An unrecognized format is a programming error, reported as such.
func toCanonicalJSON(src []byte, format Format) ([]byte, error) {
	switch format {
	case FormatJSON:
		var v any
		if err := json.Unmarshal(src, &v); err != nil {
			return nil, fmt.Errorf("workflow: parsing json: %w", err)
		}
		return json.Marshal(v)
	case FormatYAML:
		var v any
		if err := yaml.Unmarshal(src, &v); err != nil {
			return nil, fmt.Errorf("workflow: parsing yaml: %w", err)
		}
		return json.Marshal(v)
	default:
		return nil, fmt.Errorf("workflow: unknown format %q", format)
	}
}
