import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import schema from './v1.json';

/**
 * The bundled, authoritative FME Workflow v1 JSON Schema (draft 2020-12). Source of
 * truth: schemas/workflow/v1.json. The GUI bundles this exact file (byte-identical,
 * guarded by a test) and never authors a divergent copy, so the runner and the daemon
 * share one contract (runner-GUI doc section 5 and open-item 1). The daemon remains
 * authoritative; these client checks are UX only.
 */
export const WORKFLOW_SCHEMA = schema;

/**
 * The valid step types, DERIVED from the schema's discriminator enum rather than
 * hardcoded, so a future format step type appears here with no code change.
 */
export const STEP_TYPES: readonly string[] = schema.$defs.step.properties.type.enum;

export interface SchemaValidationResult {
    valid: boolean;
    errors: ErrorObject[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateFn = ajv.compile(schema);

/**
 * Validate an arbitrary parsed value against the bundled workflow schema. This is the
 * schema-level structural pass; rules the schema cannot express (parameter-default
 * typing, id uniqueness, acyclicity) are the daemon's job and are not duplicated here.
 */
export function validateAgainstSchema(doc: unknown): SchemaValidationResult {
    const valid = validateFn(doc);
    if (valid) {
        return { valid: true, errors: [] };
    }
    // ajv reuses the same errors array reference across calls; copy into a fresh array.
    return { valid: false, errors: [...(validateFn.errors as ErrorObject[])] };
}
