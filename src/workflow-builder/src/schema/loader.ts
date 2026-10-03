import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import schema from './v1.json';

// The bundled, authoritative FME Workflow v1 JSON Schema (draft 2020-12).
// Source of truth: schemas/workflow/v1.json. The builder bundles this exact file
// and never authors a divergent copy (docs/Workflow-Builder-App.md section 13).
export const WORKFLOW_SCHEMA = schema;

// Step types are DERIVED from the schema's discriminator enum, not hardcoded, so a
// future format step type appears here with no code change (the schema-driven
// descriptor model, section 2). The schema's $defs.step.properties.type.enum is the
// single place the valid types live.
const stepTypeEnum = schema.$defs.step.properties.type.enum;
export const STEP_TYPES: readonly string[] = stepTypeEnum;

export interface ValidationResult {
    valid: boolean;
    errors: ErrorObject[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateFn = ajv.compile(schema);

// Validate an arbitrary value against the bundled workflow schema. Structural rules
// the schema cannot express (id uniqueness, acyclicity, parameter typing of
// defaults) are layered on top elsewhere; this is the schema-level pass.
export function validateWorkflow(doc: unknown): ValidationResult {
    const valid = validateFn(doc);
    if (valid) {
        return { valid: true, errors: [] };
    }
    // ajv populates `errors` on every failed validation; copy into a fresh array
    // because ajv reuses the same array reference across calls.
    return { valid: false, errors: [...(validateFn.errors as ErrorObject[])] };
}
