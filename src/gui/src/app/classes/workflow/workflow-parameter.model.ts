/**
 * Typed model of a single workflow parameter, parsed from a workflow file's
 * `spec.parameters[]` entry. This mirrors the parameter schema in
 * `schemas/workflow/v1.json` (bundled into the GUI) and drives both the prompt's
 * field generation and the client-side pre-flight validation (runner-GUI doc
 * sections 3 and 5). The daemon remains authoritative; these client checks are UX
 * only.
 *
 * Only `string_array` is a list type (runner-GUI doc "The string_array field and
 * Browse"); every other type resolves to a single scalar value.
 */

/** The parameter types the format defines. Matches the schema `type` enum. */
export type WorkflowParameterType =
    | 'string'
    | 'int'
    | 'float'
    | 'bool'
    | 'enum'
    | 'string_array'
    | 'transfer_profile';

/**
 * A parameter as declared in the workflow file, normalized into the fields the
 * runner needs. `default` keeps the file's declared default (type-appropriate) so a
 * field can be pre-filled and reverted; `undefined` means the file set no default.
 */
export interface WorkflowParameter {
    readonly name: string;
    readonly type: WorkflowParameterType;
    readonly required: boolean;
    /**
     * The file's declared default, in the parameter's own type. A scalar type carries
     * a string/number/boolean; `string_array` carries a `string[]`. `undefined` when
     * the file declares no default.
     */
    readonly default?: string | number | boolean | string[];
    /** RE2 pattern (string / string_array only); applied full-match to every element for arrays. */
    readonly pattern?: string;
    /** Inclusive numeric bounds (int / float only). */
    readonly min?: number;
    readonly max?: number;
    /** Allowed values (enum only). */
    readonly values?: string[];
}

/**
 * True when the parameter carries a list value (its value lives in the submit
 * message's `values` field rather than `value`). Only `string_array` today.
 */
export function isArrayParameter(param: WorkflowParameter): boolean {
    return param.type === 'string_array';
}

/**
 * Whether the field must be supplied. A `string`/`enum` has an empty form so it is
 * only required when the file marks it required. A `bool`/`int`/`float` with no
 * declared default has no empty form, so it is effectively required even if the file
 * did not set `required` (runner-GUI doc "Override semantics").
 */
export function isEffectivelyRequired(param: WorkflowParameter): boolean {
    if (param.required) {
        return true;
    }

    if (param.default !== undefined) {
        return false;
    }

    return param.type === 'bool' || param.type === 'int' || param.type === 'float';
}
