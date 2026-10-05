import type { ParameterSpec, ParameterType } from '../workflow/parameters';
import type { WorkflowGraph } from '../workflow/graph';

// Pure helpers behind the document panel (docs section 15): parameter-list edits and
// the defaults text<->object conversion. The panel component only wires Cloudscape
// controls to these, keeping the real logic directly testable.

// Narrow the graph's loosely-typed parameters (unknown[]) to ParameterSpec[] for the
// panel, defaulting an absent list to empty.
export function asParameterList(parameters: WorkflowGraph['parameters']): ParameterSpec[] {
    return (parameters ?? []) as ParameterSpec[];
}

// Append a new string parameter with a generated name that does not collide with an
// existing one (param1, param2, ...).
export function addParameter(parameters: ParameterSpec[]): ParameterSpec[] {
    const taken = new Set(parameters.map((p) => p.name));
    let n = 1;
    while (taken.has(`param${n}`)) {
        n += 1;
    }
    return [...parameters, { name: `param${n}`, type: 'string' }];
}

// Remove the parameter at the given index.
export function removeParameter(parameters: ParameterSpec[], index: number): ParameterSpec[] {
    return parameters.filter((_p, i) => i !== index);
}

// Update fields of the parameter at the given index, leaving the others untouched.
export function patchParameter(
    parameters: ParameterSpec[],
    index: number,
    patch: Partial<ParameterSpec>,
): ParameterSpec[] {
    return parameters.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

// The optional/required constraint fields each parameter type may carry, matching the
// `allOf` rules in schemas/workflow/v1.json:
//   - pattern:  string, string_array (element-wise)
//   - min/max:  int, float
//   - values:   enum (required)
// Every type may also carry a `default`, edited per-row by a type-shaped control (see
// defaultToText / parseDefault), not listed here because it applies to every type.
export type ExtraField = 'pattern' | 'min' | 'max' | 'values';

const EXTRA_FIELDS_BY_TYPE: Record<ParameterType, ExtraField[]> = {
    string: ['pattern'],
    string_array: ['pattern'],
    int: ['min', 'max'],
    float: ['min', 'max'],
    enum: ['values'],
    bool: [],
    transfer_profile: [],
};

// Which constraint-field editors to show for a parameter of the given type. A type
// with no extra fields (bool, transfer_profile) renders only name + type + remove.
export function extraFieldsForType(type: ParameterType): ExtraField[] {
    return EXTRA_FIELDS_BY_TYPE[type];
}

// Whether a constraint field is required by the schema. Only enum's `values` is
// required (schema `allOf`: enum -> required: [values]); pattern and min/max are all
// optional. The panel marks the optional ones in their label.
export function isExtraFieldRequired(field: ExtraField): boolean {
    return field === 'values';
}

// All constraint fields any type can carry; used to strip fields that no longer apply
// when the type changes (the schema's `else: not: required` rules reject a stray
// pattern/min/max/values, so a leftover would make the document invalid).
const ALL_EXTRA_FIELDS: ExtraField[] = ['pattern',
    'min',
    'max',
    'values'];

// Change the type of the parameter at the given index AND drop any constraint field
// that is not valid for the new type, so the row never carries (e.g.) a leftover
// `min` after switching int -> string. The `default` is also cleared, since a value
// of the old type is almost never valid under the new one (the schema requires the
// default to match the parameter's own type). Keeps name/required.
export function patchParameterType(
    parameters: ParameterSpec[],
    index: number,
    type: ParameterType,
): ParameterSpec[] {
    const kept = new Set(extraFieldsForType(type));
    return parameters.map((p, i) => {
        if (i !== index) {
            return p;
        }
        const next: ParameterSpec = { ...p, type };
        for (const field of ALL_EXTRA_FIELDS) {
            if (!kept.has(field)) {
                delete next[field];
            }
        }
        delete next.default;
        return next;
    });
}

// Parse a numeric bound ('' clears it, otherwise the parsed number). Returns a patch
// object so the caller can apply it with patchParameter; a non-numeric string yields
// NaN which the caller treats as a cleared bound.
export function parseBound(raw: string): number | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') {
        return undefined;
    }
    const n = Number(trimmed);
    return Number.isNaN(n) ? undefined : n;
}

// An enum `values` list rendered for a text input (comma-joined), and the reverse.
export function joinValues(values: string[] | undefined): string {
    return (values ?? []).join(', ');
}

export function splitValues(raw: string): string[] {
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
}

// Render a parameter's `default` for its type-shaped text control. Used by the
// string / transfer_profile / int / float / enum editors; bool uses a checkbox, not
// this. A string_array default is comma-joined like its `values`. undefined/null -> ''.
export function defaultToText(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    if (Array.isArray(value)) {
        return value.map(String).join(', ');
    }
    return String(value);
}

// Coerce raw default-editor input back to the parameter's own type, or undefined to
// clear it (so an emptied default is removed, never left as '' which would mismatch a
// numeric/bool/array type). bool is edited by a checkbox and does not pass through
// here. A non-numeric int/float entry clears rather than storing NaN; int rounds
// toward zero per the schema's integer type.
export function parseDefault(type: ParameterType, raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === '') {
        return undefined;
    }
    if (type === 'int' || type === 'float') {
        const n = Number(trimmed);
        if (Number.isNaN(n)) {
            return undefined;
        }
        return type === 'int' ? Math.trunc(n) : n;
    }
    if (type === 'string_array') {
        return splitValues(raw);
    }
    // string, enum, transfer_profile: the raw string value.
    return raw;
}

// Render spec.defaults as pretty JSON for the defaults text area; undefined shows as
// an empty object.
export function defaultsToText(defaults: WorkflowGraph['defaults']): string {
    return JSON.stringify(defaults ?? {}, null, 4);
}

export type DefaultsParse =
    | { ok: true; value: Record<string, unknown> | undefined }
    | { ok: false; error: string };

// Parse the defaults text area back to an object (or undefined when blank). Rejects
// text that is not a JSON object, so defaults is always a map or cleared.
export function textToDefaults(text: string): DefaultsParse {
    if (text.trim() === '') {
        return { ok: true, value: undefined };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        return { ok: false, error: String(err) };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'defaults must be a JSON object' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
}
