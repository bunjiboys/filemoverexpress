import {
    isArrayParameter,
    isEffectivelyRequired,
    WorkflowParameter,
} from '@app/classes/workflow/workflow-parameter.model';

/**
 * The in-form value a parameter field holds. A scalar parameter carries a single
 * string (the user's entered text, uncoerced -- the daemon owns coercion); a
 * `string_array` carries the ordered list of chip values.
 */
export type WorkflowFieldValue = string | string[];

/**
 * The submit shape for one parameter, matching `fme.v1.WorkflowParamValue`: a scalar
 * fills `value` (and leaves `values` empty); a `string_array` fills `values` (and
 * leaves `value` empty), so a multi-source selection travels as discrete elements
 * rather than a delimited string (runner-GUI doc section 4).
 */
export interface WorkflowParamSubmission {
    name: string;
    value: string;
    values: string[];
}

/**
 * The field's pre-filled initial value from the file's declared default (runner-GUI
 * doc "Override semantics"). A `string_array` default is copied into a fresh array so
 * the form can mutate it without aliasing the parsed parameter. A scalar with no
 * default starts empty.
 */
export function initialFieldValue(param: WorkflowParameter): WorkflowFieldValue {
    if (isArrayParameter(param)) {
        const def = param.default;
        return Array.isArray(def) ? [...def] : [];
    }

    if (param.default === undefined) {
        return '';
    }

    return String(param.default);
}

/**
 * Full-match a value against an RE2-style pattern, mirroring the daemon's full-match
 * semantics (the pattern must match the entire value, not a substring). The caller is
 * responsible for only invoking this when a pattern is declared.
 */
function matchesPattern(pattern: string, value: string): boolean {
    // Anchor to a full match; the daemon applies the pattern as a full match too.
    const anchored = new RegExp(`^(?:${pattern})$`);
    return anchored.test(value);
}

/**
 * Client-side pre-flight validation for a `string_array` field. Returns a
 * human-readable error message, or null when valid. This mirrors the schema
 * constraints for immediate feedback; the daemon is authoritative (runner-GUI doc
 * section 5).
 *
 * - A required `string_array` must have at least one element.
 * - When the parameter declares a `pattern`, every element must full-match it; the
 *   first offending element is reported.
 */
function validateArrayField(param: WorkflowParameter, values: string[]): string | null {
    if (values.length === 0) {
        return param.required ? `${param.name} requires at least one value` : null;
    }

    if (param.pattern !== undefined) {
        const pattern = param.pattern;
        const offender = values.find((v) => !matchesPattern(pattern, v));
        if (offender !== undefined) {
            return `${param.name} element "${offender}" does not match pattern ${param.pattern}`;
        }
    }

    return null;
}

/**
 * Client-side pre-flight validation for a scalar field (string/int/float/bool/enum).
 * Returns an error message or null when valid. Mirrors the schema constraints for
 * immediate feedback; the daemon is authoritative. The GUI does not coerce -- it
 * validates the user's entered text against the declared type and constraints.
 */
function validateScalarField(param: WorkflowParameter, value: string): string | null {
    if (value === '') {
        return isEffectivelyRequired(param) ? `${param.name} is required` : null;
    }

    switch (param.type) {
        case 'string':
            return validateStringPattern(param, value);
        case 'int':
            return validateIntField(param, value);
        case 'float':
            return validateFloatField(param, value);
        case 'bool':
            return value === 'true' || value === 'false' ? null : `${param.name} must be true or false`;
        case 'enum':
            return (param.values ?? []).includes(value)
                ? null
                : `${param.name} must be one of: ${(param.values ?? []).join(', ')}`;
        case 'transfer_profile':
            // The allowed set is the daemon's live transfer profiles, not a value declared
            // on the parameter, and the daemon validates membership authoritatively at
            // submit time. The field presents the live profiles as a dropdown; client
            // pre-flight only enforces required-ness (handled by the empty check above), so
            // a chosen non-empty value is always client-valid.
            return null;
        /* c8 ignore next 3 -- justified-unreachable: string_array is routed to the array
           path before this switch, and every other WorkflowParameterType has a case; the
           default is a defense for a future scalar type added without a case here. */
        default:
            return null;
    }
}

/** Full-match a string parameter against its declared pattern, if any. */
function validateStringPattern(param: WorkflowParameter, value: string): string | null {
    if (param.pattern !== undefined && !matchesPattern(param.pattern, value)) {
        return `${param.name} does not match pattern ${param.pattern}`;
    }
    return null;
}

/** Validate an int field: integer parse plus inclusive min/max bounds. */
function validateIntField(param: WorkflowParameter, value: string): string | null {
    if (!/^[+-]?\d+$/.test(value)) {
        return `${param.name} must be an integer`;
    }
    return checkNumericBounds(param, Number(value));
}

/** Validate a float field: numeric parse plus inclusive min/max bounds. */
function validateFloatField(param: WorkflowParameter, value: string): string | null {
    const num = Number(value);
    if (value.trim() === '' || Number.isNaN(num)) {
        return `${param.name} must be a number`;
    }
    return checkNumericBounds(param, num);
}

/** Apply inclusive min/max bounds to a parsed number. */
function checkNumericBounds(param: WorkflowParameter, num: number): string | null {
    if (param.min !== undefined && num < param.min) {
        return `${param.name} must be >= ${param.min}`;
    }
    if (param.max !== undefined && num > param.max) {
        return `${param.name} must be <= ${param.max}`;
    }
    return null;
}

/**
 * Client-side pre-flight validation for one field. Dispatches on the parameter type.
 * Returns an error message or null when valid.
 */
export function validateField(param: WorkflowParameter, value: WorkflowFieldValue): string | null {
    if (isArrayParameter(param)) {
        return validateArrayField(param, Array.isArray(value) ? value : []);
    }

    return validateScalarField(param, typeof value === 'string' ? value : '');
}

/**
 * Whether the current field value differs from the file's declared default, so the
 * UI can flag an override and offer a revert (runner-GUI doc "Override semantics").
 * For a `string_array`, equality is order-sensitive and element-wise; a non-empty
 * value against no declared default counts as an override.
 */
export function isFieldOverridden(param: WorkflowParameter, value: WorkflowFieldValue): boolean {
    if (isArrayParameter(param)) {
        const current = Array.isArray(value) ? value : [];
        const def = Array.isArray(param.default) ? param.default : [];
        if (current.length !== def.length) {
            return true;
        }
        return current.some((element, i) => element !== def[i]);
    }

    const current = typeof value === 'string' ? value : '';
    const def = param.default === undefined ? '' : String(param.default);
    return current !== def;
}

/**
 * Encode a field value into the daemon submit shape. A `string_array` fills `values`
 * and leaves `value` empty; a scalar fills `value` and leaves `values` empty. The GUI
 * does not coerce -- it submits the user's text (runner-GUI doc section 4).
 */
export function toParamSubmission(param: WorkflowParameter, value: WorkflowFieldValue): WorkflowParamSubmission {
    if (isArrayParameter(param)) {
        return {
            name: param.name,
            value: '',
            values: Array.isArray(value) ? [...value] : [],
        };
    }

    return {
        name: param.name,
        value: typeof value === 'string' ? value : '',
        values: [],
    };
}
