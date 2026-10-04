package workflow

import (
	"reflect"
	"strings"
	"testing"
)

// f64 returns a pointer to a float64, for setting Parameter.Min / Parameter.Max in
// table tests.
func f64(v float64) *float64 { return &v }

// --- resolveOne: precedence, required, empty-form, typed-no-default ---

func TestResolveOnePrecedenceAndEmptyForms(t *testing.T) {
	cases := []struct {
		name      string
		spec      Parameter
		values    map[string]string
		wantValue any
		wantErr   string // substring; empty means no error expected
	}{
		{
			name:      "user value overrides default",
			spec:      Parameter{Name: "show", Type: ParamString, Default: "project-x"},
			values:    map[string]string{"show": "project-y"},
			wantValue: "project-y",
		},
		{
			name:      "default used when unsupplied",
			spec:      Parameter{Name: "show", Type: ParamString, Default: "project-x"},
			values:    map[string]string{},
			wantValue: "project-x",
		},
		{
			name:      "string empty form when neither supplied nor default",
			spec:      Parameter{Name: "note", Type: ParamString},
			values:    map[string]string{},
			wantValue: "",
		},
		{
			name:      "enum empty form when neither supplied nor default",
			spec:      Parameter{Name: "env", Type: ParamEnum, Values: []string{"prod", "staging"}},
			values:    map[string]string{},
			wantValue: "",
		},
		{
			name:    "required with no value is an error",
			spec:    Parameter{Name: "day", Type: ParamString, Required: true},
			values:  map[string]string{},
			wantErr: "required parameter: day",
		},
		{
			name:    "bool with neither value nor default is an error",
			spec:    Parameter{Name: "force", Type: ParamBool},
			values:  map[string]string{},
			wantErr: "has no value and no default: force",
		},
		{
			name:    "int with neither value nor default is an error",
			spec:    Parameter{Name: "n", Type: ParamInt},
			values:  map[string]string{},
			wantErr: "has no value and no default: n",
		},
		{
			name:    "float with neither value nor default is an error",
			spec:    Parameter{Name: "x", Type: ParamFloat},
			values:  map[string]string{},
			wantErr: "has no value and no default: x",
		},
		{
			name:      "user empty string beats default (explicit supply)",
			spec:      Parameter{Name: "show", Type: ParamString, Default: "project-x"},
			values:    map[string]string{"show": ""},
			wantValue: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, errs := resolveParams([]Parameter{tc.spec}, tc.values)
			assertErr(t, errs, tc.wantErr)
			if tc.wantErr == "" && !reflect.DeepEqual(got[tc.spec.Name].value, tc.wantValue) {
				t.Errorf("value = %#v (%T), want %#v (%T)",
					got[tc.spec.Name].value, got[tc.spec.Name].value, tc.wantValue, tc.wantValue)
			}
		})
	}
}

// --- coercion: string / int / float / bool / enum from string inputs ---

func TestResolveOneCoercion(t *testing.T) {
	cases := []struct {
		name      string
		spec      Parameter
		values    map[string]string
		wantValue any
		wantErr   string
	}{
		{"string stays string", Parameter{Name: "s", Type: ParamString}, map[string]string{"s": "hello"}, "hello", ""},
		{"int coerces to int64", Parameter{Name: "n", Type: ParamInt}, map[string]string{"n": "42"}, int64(42), ""},
		{"negative int", Parameter{Name: "n", Type: ParamInt}, map[string]string{"n": "-7"}, int64(-7), ""},
		{"int rejects non-integer", Parameter{Name: "n", Type: ParamInt}, map[string]string{"n": "4.5"}, nil, "not a valid int"},
		{"int rejects garbage", Parameter{Name: "n", Type: ParamInt}, map[string]string{"n": "abc"}, nil, "not a valid int"},
		{"float coerces to float64", Parameter{Name: "x", Type: ParamFloat}, map[string]string{"x": "1.5"}, float64(1.5), ""},
		{"float accepts integer form", Parameter{Name: "x", Type: ParamFloat}, map[string]string{"x": "3"}, float64(3), ""},
		{"float rejects garbage", Parameter{Name: "x", Type: ParamFloat}, map[string]string{"x": "nope"}, nil, "not a valid float"},
		{"bool true", Parameter{Name: "b", Type: ParamBool}, map[string]string{"b": "true"}, true, ""},
		{"bool false", Parameter{Name: "b", Type: ParamBool}, map[string]string{"b": "false"}, false, ""},
		{"bool rejects garbage", Parameter{Name: "b", Type: ParamBool}, map[string]string{"b": "yes"}, nil, "not a valid bool"},
		{"enum member", Parameter{Name: "e", Type: ParamEnum, Values: []string{"a", "b"}}, map[string]string{"e": "a"}, "a", ""},
		{"enum non-member", Parameter{Name: "e", Type: ParamEnum, Values: []string{"a", "b"}}, map[string]string{"e": "c"}, nil, "is not one of"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, errs := resolveParams([]Parameter{tc.spec}, tc.values)
			assertErr(t, errs, tc.wantErr)
			if tc.wantErr == "" && !reflect.DeepEqual(got[tc.spec.Name].value, tc.wantValue) {
				t.Errorf("value = %#v (%T), want %#v (%T)",
					got[tc.spec.Name].value, got[tc.spec.Name].value, tc.wantValue, tc.wantValue)
			}
		})
	}
}

// --- coercion from a typed default (not a user string) ---

func TestResolveOneCoercesTypedDefault(t *testing.T) {
	cases := []struct {
		name      string
		spec      Parameter
		wantValue any
	}{
		// yaml/json canonicalization yields float64 for numbers and bool for booleans.
		{"int default as float64", Parameter{Name: "n", Type: ParamInt, Default: float64(12)}, int64(12)},
		{"float default as float64", Parameter{Name: "x", Type: ParamFloat, Default: float64(1.5)}, float64(1.5)},
		{"bool default as bool", Parameter{Name: "b", Type: ParamBool, Default: false}, false},
		{"string default", Parameter{Name: "s", Type: ParamString, Default: "hi"}, "hi"},
		{"enum default", Parameter{Name: "e", Type: ParamEnum, Values: []string{"prod", "staging"}, Default: "prod"}, "prod"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, errs := resolveParams([]Parameter{tc.spec}, map[string]string{})
			assertErr(t, errs, "")
			if !reflect.DeepEqual(got[tc.spec.Name].value, tc.wantValue) {
				t.Errorf("value = %#v (%T), want %#v (%T)",
					got[tc.spec.Name].value, got[tc.spec.Name].value, tc.wantValue, tc.wantValue)
			}
		})
	}
}

// --- constraints: pattern / min / max ---

func TestResolveOneConstraints(t *testing.T) {
	cases := []struct {
		name    string
		spec    Parameter
		values  map[string]string
		wantErr string
	}{
		{"pattern match", Parameter{Name: "d", Type: ParamString, Pattern: `^\d{4}$`}, map[string]string{"d": "2026"}, ""},
		{"pattern miss", Parameter{Name: "d", Type: ParamString, Pattern: `^\d{4}$`}, map[string]string{"d": "26"}, "does not match pattern"},
		{"pattern full-match not partial", Parameter{Name: "d", Type: ParamString, Pattern: `\d{4}`}, map[string]string{"d": "x2026x"}, "does not match pattern"},
		{"invalid pattern regexp", Parameter{Name: "d", Type: ParamString, Pattern: `(`}, map[string]string{"d": "x"}, "invalid pattern"},
		{"int min ok", Parameter{Name: "n", Type: ParamInt, Min: f64(1)}, map[string]string{"n": "1"}, ""},
		{"int below min", Parameter{Name: "n", Type: ParamInt, Min: f64(1)}, map[string]string{"n": "0"}, "out of range"},
		{"int max ok", Parameter{Name: "n", Type: ParamInt, Max: f64(10)}, map[string]string{"n": "10"}, ""},
		{"int above max", Parameter{Name: "n", Type: ParamInt, Max: f64(10)}, map[string]string{"n": "11"}, "out of range"},
		{"float below min", Parameter{Name: "x", Type: ParamFloat, Min: f64(0.5)}, map[string]string{"x": "0.25"}, "out of range"},
		{"float above max", Parameter{Name: "x", Type: ParamFloat, Max: f64(1.5)}, map[string]string{"x": "2.0"}, "out of range"},
		{"within both bounds", Parameter{Name: "n", Type: ParamInt, Min: f64(1), Max: f64(10)}, map[string]string{"n": "5"}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, errs := resolveParams([]Parameter{tc.spec}, tc.values)
			assertErr(t, errs, tc.wantErr)
		})
	}
}

// --- Resolve: full substitution into `with` and `defaults` ---

func TestResolveWholeValuePreservesType(t *testing.T) {
	params := []Parameter{
		{Name: "force", Type: ParamBool, Default: true},
		{Name: "count", Type: ParamInt, Default: float64(3)},
		{Name: "ratio", Type: ParamFloat, Default: float64(1.5)},
		{Name: "show", Type: ParamString, Default: "px"},
	}
	with := map[string]any{
		"force": "${params.force}",
		"count": "${params.count}",
		"ratio": "${params.ratio}",
		"show":  "${params.show}",
	}
	got, errs := Resolve(with, nil, params, map[string]string{})
	assertErr(t, errs, "")
	want := map[string]any{
		"force": true,
		"count": int64(3),
		"ratio": float64(1.5),
		"show":  "px",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("resolved = %#v, want %#v", got, want)
	}
}

func TestResolveEmbeddedRendersToString(t *testing.T) {
	params := []Parameter{
		{Name: "day", Type: ParamString, Default: "15"},
		{Name: "show", Type: ParamString, Default: "project-x"},
		{Name: "n", Type: ParamInt, Default: float64(7)},
		{Name: "x", Type: ParamFloat, Default: float64(2.5)},
		{Name: "b", Type: ParamBool, Default: true},
	}
	with := map[string]any{
		"dest":  "shows/${params.show}/day-${params.day}",
		"mixed": "n=${params.n} x=${params.x} b=${params.b}",
	}
	got, errs := Resolve(with, nil, params, map[string]string{})
	assertErr(t, errs, "")
	want := map[string]any{
		"dest":  "shows/project-x/day-15",
		"mixed": "n=7 x=2.5 b=true",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("resolved = %#v, want %#v", got, want)
	}
}

func TestResolveNumberRendering(t *testing.T) {
	// Format doc: decimal form, no exponent, no trailing-zero padding.
	params := []Parameter{
		{Name: "big", Type: ParamFloat, Default: float64(1000000)},
		{Name: "frac", Type: ParamFloat, Default: float64(0.0001)},
		{Name: "whole", Type: ParamFloat, Default: float64(3.0)},
		{Name: "neg", Type: ParamInt, Default: float64(-42)},
	}
	with := map[string]any{"s": "big=${params.big} frac=${params.frac} whole=${params.whole} neg=${params.neg}"}
	got, errs := Resolve(with, nil, params, map[string]string{})
	assertErr(t, errs, "")
	want := "big=1000000 frac=0.0001 whole=3 neg=-42"
	if got["s"] != want {
		t.Errorf("rendered = %q, want %q", got["s"], want)
	}
}

func TestResolveNestedAndArrayValues(t *testing.T) {
	params := []Parameter{{Name: "day", Type: ParamString, Default: "15"}}
	with := map[string]any{
		"sources": []any{"/mnt/day-${params.day}", "/other"},
		"nested":  map[string]any{"inner": "d${params.day}"},
		"num":     float64(5),
		"flag":    true,
		"null":    nil,
	}
	got, errs := Resolve(with, nil, params, map[string]string{})
	assertErr(t, errs, "")
	want := map[string]any{
		"sources": []any{"/mnt/day-15", "/other"},
		"nested":  map[string]any{"inner": "d15"},
		"num":     float64(5),
		"flag":    true,
		"null":    nil,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("resolved = %#v, want %#v", got, want)
	}
}

func TestResolveDefaultsMergedThenWithWins(t *testing.T) {
	params := []Parameter{
		{Name: "profile", Type: ParamString, Default: "prod"},
		{Name: "force", Type: ParamBool, Default: false},
	}
	defaults := map[string]any{
		"transferProfile": "${params.profile}",
		"force":           "${params.force}",
	}
	with := map[string]any{
		"force":       true, // step overrides the merged default
		"destination": "d",
	}
	got, errs := Resolve(with, defaults, params, map[string]string{})
	assertErr(t, errs, "")
	want := map[string]any{
		"transferProfile": "prod",
		"force":           true,
		"destination":     "d",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("resolved = %#v, want %#v", got, want)
	}
}

func TestResolveUnknownReference(t *testing.T) {
	// A ${params.x} naming a parameter that was not declared is an error, not a
	// silent empty substitution.
	params := []Parameter{{Name: "day", Type: ParamString, Default: "15"}}
	with := map[string]any{
		"whole":    "${params.missing}",
		"embedded": "x${params.alsoMissing}y",
	}
	_, errs := Resolve(with, nil, params, map[string]string{})
	joined := strings.Join(errs, "\n")
	if !strings.Contains(joined, "missing") || !strings.Contains(joined, "alsoMissing") {
		t.Errorf("expected unknown-reference errors for both, got: %v", errs)
	}
}

func TestResolveReportsResolutionErrors(t *testing.T) {
	// A resolution error (required param missing) is surfaced; substitution still
	// runs so the caller gets both the partial result and the errors.
	params := []Parameter{{Name: "day", Type: ParamString, Required: true}}
	with := map[string]any{"dest": "day-${params.day}"}
	_, errs := Resolve(with, nil, params, map[string]string{})
	assertErr(t, errs, "required parameter: day")
}

func TestResolveNilInputs(t *testing.T) {
	// No parameters, no defaults: with is returned structurally unchanged.
	with := map[string]any{"a": "b", "n": float64(1)}
	got, errs := Resolve(with, nil, nil, nil)
	assertErr(t, errs, "")
	if !reflect.DeepEqual(got, with) {
		t.Errorf("resolved = %#v, want %#v", got, with)
	}
}

// assertErr asserts that errs contains want as a substring of some entry, or that errs
// is empty when want is empty.
func assertErr(t *testing.T, errs []string, want string) {
	t.Helper()
	if want == "" {
		if len(errs) != 0 {
			t.Fatalf("unexpected errors: %v", errs)
		}
		return
	}
	for _, e := range errs {
		if strings.Contains(e, want) {
			return
		}
	}
	t.Fatalf("expected an error containing %q, got: %v", want, errs)
}
