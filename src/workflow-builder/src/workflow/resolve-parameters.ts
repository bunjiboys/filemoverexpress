import { PARAM_REF, type ParameterSpec } from './parameters';

export interface ResolveResult {
    resolved: Record<string, unknown>;
    errors: string[];
}

interface ResolvedParam {
    value: unknown; // typed value (bool/number/string), or undefined if unresolved
    hasValue: boolean;
}

// Resolve declared parameters against supplied values, then substitute
// ${params.name} references inside the `with` payload (format doc Parameters).
//
// Substitution rules:
// - whole-value reference ("${params.x}" alone): keeps the parameter's native type
//   (a bool stays a bool, an int stays a number) so a typed `with` field is filled
//   with the right type.
// - embedded reference ("v${params.x}"): the parameter is rendered to its string
//   form and spliced into the surrounding string.
// Name-lookup only; no expressions.
export function resolveParameters(
    withValue: Record<string, unknown>,
    parameters: ParameterSpec[],
    values: Record<string, unknown>,
): ResolveResult {
    const errors: string[] = [];
    const resolved = new Map<string, ResolvedParam>();

    for (const spec of parameters) {
        resolved.set(spec.name, resolveOne(spec, values, errors));
    }

    const substituteValue = (value: unknown): unknown => {
        if (typeof value !== 'string') {
            if (Array.isArray(value)) {
                return value.map(substituteValue);
            }
            if (value !== null && typeof value === 'object') {
                return Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [k, substituteValue(v)]),
                );
            }
            return value;
        }

        // Whole-value reference: preserve native type.
        const whole = /^\$\{params\.([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value);
        if (whole !== null) {
            const param = resolved.get(whole[1]);
            return param !== undefined ? param.value : value;
        }

        // Embedded: render each reference to its string form.
        return value.replace(PARAM_REF, (_match, name: string) => {
            const param = resolved.get(name);
            return param !== undefined ? renderString(param.value) : '';
        });
    };

    return {
        resolved: substituteValue(withValue) as Record<string, unknown>,
        errors,
    };
}

function resolveOne(spec: ParameterSpec, values: Record<string, unknown>, errors: string[]): ResolvedParam {
    const supplied = Object.prototype.hasOwnProperty.call(values, spec.name);
    let raw: unknown = supplied ? values[spec.name] : spec.default;
    const hasValue = raw !== undefined;

    if (!hasValue) {
        if (spec.required) {
            errors.push(`required parameter: ${spec.name}`);
            return { value: undefined, hasValue: false };
        }
        if (spec.type === 'string' || spec.type === 'enum' || spec.type === 'transfer_profile') {
            return { value: '', hasValue: false }; // empty form
        }
        if (spec.type === 'string_array') {
            return { value: [], hasValue: false }; // empty list form
        }
        // bool/int/float have no empty form.
        errors.push(`parameter has no value and no default: ${spec.name}`);
        return { value: undefined, hasValue: false };
    }

    raw = checkConstraints(spec, raw, errors);
    return { value: raw, hasValue: true };
}

function checkConstraints(spec: ParameterSpec, value: unknown, errors: string[]): unknown {
    if (spec.type === 'enum' && spec.values !== undefined && !spec.values.includes(value as string)) {
        errors.push(`parameter ${spec.name} is not one of ${spec.values.join(', ')}`);
    }
    if ((spec.type === 'int' || spec.type === 'float') && typeof value === 'number') {
        if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
            errors.push(`parameter ${spec.name} is out of range`);
        }
    }
    if (spec.type === 'string' && spec.pattern !== undefined && typeof value === 'string') {
        if (!new RegExp(spec.pattern).test(value)) {
            errors.push(`parameter ${spec.name} does not match pattern`);
        }
    }
    // string_array: the pattern applies element-wise to every string element
    // (format doc Parameters; wire-level the array travels in the repeated `values`
    // field, but in the builder a string_array value is a plain JS string[]).
    if (spec.type === 'string_array' && spec.pattern !== undefined && Array.isArray(value)) {
        const re = new RegExp(spec.pattern);
        for (const element of value) {
            if (typeof element !== 'string' || !re.test(element)) {
                errors.push(`parameter ${spec.name} has an element that does not match pattern`);
                break;
            }
        }
    }
    // transfer_profile resolves to a profile-name string; membership in the daemon's
    // live profile list is daemon-authoritative and not checked here (the builder has
    // no daemon connection).
    return value;
}

// Render a resolved value to its string form for embedding. Numbers render as a
// plain decimal (no exponent, no trailing-zero padding); booleans as true/false.
function renderString(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    // String() renders a number as a plain decimal (no exponent, no trailing-zero
    // padding), a boolean as true/false, and a string as itself.
    return String(value);
}
