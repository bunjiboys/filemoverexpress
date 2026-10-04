package workflow

import (
	"fmt"
	"regexp"
	"strconv"
)

// paramRef matches a ${params.<name>} reference. The name grammar matches the schema's
// parameter name pattern (^[A-Za-z_][A-Za-z0-9_]*$). It is used both to find embedded
// references within a larger string and (anchored) to detect a whole-value reference.
//
// wholeRef matches a value that is EXACTLY one ${params.<name>} reference and nothing
// else. A whole-value reference preserves the parameter's native type; an embedded one
// renders to string form (format doc "Parameter types").
var (
	paramRef = regexp.MustCompile(`\$\{params\.([A-Za-z_][A-Za-z0-9_]*)\}`)
	wholeRef = regexp.MustCompile(`^\$\{params\.([A-Za-z_][A-Za-z0-9_]*)\}$`)
)

type (
	// resolvedParam is the outcome of resolving one declared parameter: its typed value
	// (string/int64/float64/bool) and whether a concrete value (vs an empty form) was
	// produced. Unresolved parameters (required-missing, bad coercion) carry a nil value
	// and the resolution error is recorded separately.
	resolvedParam struct {
		value any
	}

	// resolvedSet maps a declared parameter name to its resolved value.
	resolvedSet map[string]resolvedParam

	// substitutor carries the resolved parameter set and accumulates substitution errors
	// (an undeclared ${params.x} reference) while walking a `with` payload.
	substitutor struct {
		set  resolvedSet
		errs []string
	}
)

// Resolve applies declared parameters to a step's `with` payload (format doc
// "Parameters"). It resolves each declared parameter against the caller-supplied values
// (precedence: user value > declared default > empty form), coercing and
// constraint-checking it, then merges `defaults` under `with` and substitutes every
// ${params.name} reference.
//
// Caller values arrive as strings (the RPC carries WorkflowParamValue as string->string,
// mirroring the CLI's --param k=v form); the declared default is already a typed value
// from the parsed document. Both are coerced through one path to the parameter's declared
// type, so a bool default and a "true" user value resolve identically.
//
// Substitution is whole-value (preserves native type) or embedded (renders to string),
// and recurses into arrays and nested maps. It applies only within `with`/`defaults`,
// never to type/id/dependsOn, which the caller does not pass here. Resolution and
// substitution errors are returned together with the (partially) resolved payload so the
// caller gets both.
func Resolve(with, defaults map[string]any, params []Parameter, values map[string]string) (map[string]any, []string) {
	set, errs := resolveParams(params, values)

	merged := mergeDefaults(with, defaults)

	sub := &substitutor{set: set, errs: errs}
	resolved, _ := sub.value(merged).(map[string]any)
	return resolved, sub.errs
}

// mergeDefaults produces a new map with defaults as the base and with layered on top, so
// a key present in both takes the step's `with` value (format doc: defaults are merged
// INTO each step's with). Neither input is mutated.
func mergeDefaults(with, defaults map[string]any) map[string]any {
	merged := make(map[string]any, len(with)+len(defaults))
	for k, v := range defaults {
		merged[k] = v
	}
	for k, v := range with {
		merged[k] = v
	}
	return merged
}

// resolveParams resolves every declared parameter into the set, collecting one error
// string per failure. The returned set always has an entry per declared parameter so
// substitution can distinguish a declared-but-unresolved reference from an
// undeclared one.
func resolveParams(params []Parameter, values map[string]string) (resolvedSet, []string) {
	set := make(resolvedSet, len(params))
	var errs []string
	for i := range params {
		spec := params[i]
		rp, err := resolveOne(spec, values)
		if err != "" {
			errs = append(errs, err)
		}
		set[spec.Name] = rp
	}
	return set, errs
}

// resolveOne resolves a single parameter: applies precedence, enforces the required and
// typed-no-default rules, then coerces and constraint-checks. It returns the resolved
// param and an error string ("" on success).
func resolveOne(spec Parameter, values map[string]string) (resolvedParam, string) {
	raw, supplied := rawValue(spec, values)
	if !supplied {
		return emptyForm(spec)
	}

	typed, err := coerce(spec, raw)
	if err != "" {
		return resolvedParam{}, err
	}
	if err := checkConstraints(spec, typed); err != "" {
		return resolvedParam{}, err
	}
	return resolvedParam{value: typed}, ""
}

// rawValue returns the string form of the value to resolve and whether one is present,
// applying precedence user value > declared default. A user-supplied value (even an
// empty string) wins over the default; absence of both yields supplied=false.
func rawValue(spec Parameter, values map[string]string) (string, bool) {
	if v, ok := values[spec.Name]; ok {
		return v, true
	}
	if spec.Default != nil {
		return renderString(spec.Default), true
	}
	return "", false
}

// emptyForm handles a parameter with neither a user value nor a default. required is an
// error; string/enum resolve to the empty string; bool/int/float have no empty form and
// are an error (format doc "Parameter types").
func emptyForm(spec Parameter) (resolvedParam, string) {
	if spec.Required {
		return resolvedParam{}, fmt.Sprintf("required parameter: %s", spec.Name)
	}
	if spec.Type == ParamString || spec.Type == ParamEnum {
		return resolvedParam{value: ""}, ""
	}
	return resolvedParam{}, fmt.Sprintf("parameter has no value and no default: %s", spec.Name)
}

// coerce converts the raw string into the parameter's declared Go type: string stays a
// string, int becomes int64, float becomes float64, bool becomes bool, enum stays a
// string (membership is checked by checkConstraints).
func coerce(spec Parameter, raw string) (any, string) {
	switch spec.Type {
	case ParamString, ParamEnum:
		return raw, ""
	case ParamInt:
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return nil, fmt.Sprintf("parameter %s is not a valid int: %q", spec.Name, raw)
		}
		return n, ""
	case ParamFloat:
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return nil, fmt.Sprintf("parameter %s is not a valid float: %q", spec.Name, raw)
		}
		return f, ""
	case ParamBool:
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return nil, fmt.Sprintf("parameter %s is not a valid bool: %q", spec.Name, raw)
		}
		return b, ""
	default:
		// COVERAGE: justified-unreachable defensive branch. spec.Type is one of the five
		// ParameterType constants in a schema-validated document (the schema's parameter
		// `type` enum rejects any other value before resolution runs). Kept as a defensive
		// error rather than a panic; not covered because exercising it would require an
		// out-of-enum type the schema cannot admit.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return nil, fmt.Sprintf("parameter %s has unknown type %q", spec.Name, spec.Type)
	}
}

// checkConstraints validates the typed value against the parameter's type-scoped
// constraints: pattern (string, RE2 full-match), min/max (int/float, inclusive), enum
// membership (values). It returns "" when the value satisfies them.
func checkConstraints(spec Parameter, value any) string {
	switch spec.Type {
	case ParamString:
		return checkPattern(spec, value)
	case ParamEnum:
		return checkEnum(spec, value)
	case ParamInt, ParamFloat:
		return checkRange(spec, value)
	default:
		return ""
	}
}

// checkPattern enforces a string parameter's RE2 pattern as a FULL match (the whole value
// must match, not a substring). An un-compilable pattern is reported as an error.
func checkPattern(spec Parameter, value any) string {
	if spec.Pattern == "" {
		return ""
	}
	re, err := regexp.Compile(spec.Pattern)
	if err != nil {
		return fmt.Sprintf("parameter %s has an invalid pattern: %v", spec.Name, err)
	}
	s, _ := value.(string)
	if m := re.FindString(s); m != s {
		return fmt.Sprintf("parameter %s does not match pattern %s", spec.Name, spec.Pattern)
	}
	return ""
}

// checkEnum enforces that an enum value is one of the declared values.
func checkEnum(spec Parameter, value any) string {
	s, _ := value.(string)
	for _, allowed := range spec.Values {
		if s == allowed {
			return ""
		}
	}
	return fmt.Sprintf("parameter %s is not one of the allowed values", spec.Name)
}

// checkRange enforces inclusive min/max bounds on a numeric value. The value is int64 or
// float64; both compare against the float64 bounds without precision concern for the
// ranges this format admits.
func checkRange(spec Parameter, value any) string {
	if spec.Min == nil && spec.Max == nil {
		return ""
	}
	f := numericAsFloat(value)
	if (spec.Min != nil && f < *spec.Min) || (spec.Max != nil && f > *spec.Max) {
		return fmt.Sprintf("parameter %s is out of range", spec.Name)
	}
	return ""
}

// numericAsFloat returns the float64 view of a resolved numeric value (int64 or float64).
func numericAsFloat(value any) float64 {
	switch n := value.(type) {
	case int64:
		return float64(n)
	case float64:
		return n
	default:
		// COVERAGE: justified-unreachable defensive branch. checkRange is only reached for
		// ParamInt/ParamFloat, whose coerced values are int64/float64; no other type
		// arrives here. Kept defensive (returns 0) rather than panicking; not covered
		// because no schema-valid input produces another type.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return 0
	}
}

// value recursively substitutes parameter references within v: strings are substituted,
// arrays and maps are walked, and other scalars pass through unchanged.
func (s *substitutor) value(v any) any {
	switch val := v.(type) {
	case string:
		return s.substituteString(val)
	case []any:
		out := make([]any, len(val))
		for i, item := range val {
			out[i] = s.value(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, item := range val {
			out[k] = s.value(item)
		}
		return out
	default:
		return v
	}
}

// substituteString applies whole-value substitution (preserving native type) when the
// string is exactly one reference, otherwise renders every embedded reference to its
// string form. An undeclared reference records an error; a whole-value reference to an
// undeclared parameter is left untouched so the error is actionable.
func (s *substitutor) substituteString(str string) any {
	if m := wholeRef.FindStringSubmatch(str); m != nil {
		rp, ok := s.set[m[1]]
		if !ok {
			s.errs = append(s.errs, fmt.Sprintf("unknown parameter reference: %s", m[1]))
			return str
		}
		return rp.value
	}
	return paramRef.ReplaceAllStringFunc(str, func(ref string) string {
		name := paramRef.FindStringSubmatch(ref)[1]
		rp, ok := s.set[name]
		if !ok {
			s.errs = append(s.errs, fmt.Sprintf("unknown parameter reference: %s", name))
			return ""
		}
		return renderString(rp.value)
	})
}

// renderString renders a resolved value to its string form for embedding (format doc:
// decimal form, no exponent, no trailing-zero padding; bool as true/false). A nil value
// (an empty-form string/enum resolves to "", never nil) renders empty.
func renderString(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		// COVERAGE: justified-unreachable defensive branch. renderString is called on a
		// coerced parameter value (string/bool/int64/float64) or on spec.Default, which in
		// a schema-valid document is a scalar of the parameter's type (JSON numbers arrive
		// as float64, booleans as bool, strings as string). A non-scalar default is
		// rejected by schema validation before resolution runs, so no map/slice reaches
		// here. Kept as a %v fallback rather than panicking; not covered because exercising
		// it would require a default the schema cannot admit.
		// See docs/designs/workflows/Workflow-Engine-Implementation-Plan.md.
		return fmt.Sprintf("%v", v)
	}
}
