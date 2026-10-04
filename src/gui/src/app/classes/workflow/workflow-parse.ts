import { parse as parseYaml } from 'yaml';
import { validateAgainstSchema } from '@app/classes/workflow/schema/loader';
import { ParsedWorkflowDocument, WorkflowStepSummary } from '@app/classes/workflow/workflow-document.model';
import { WorkflowParameter, WorkflowParameterType } from '@app/classes/workflow/workflow-parameter.model';

/** Why a parse failed, so the GUI can route it to a syntax banner vs a schema banner. */
export type WorkflowParseErrorKind = 'syntax' | 'schema';

export interface WorkflowParseError {
    kind: WorkflowParseErrorKind;
    message: string;
}

/** The result of parsing a workflow file: a parsed document, or an error. */
export type WorkflowParseResult =
    | { ok: true; document: ParsedWorkflowDocument }
    | { ok: false; error: WorkflowParseError };

const FALLBACK_NAME = '(unnamed workflow)';

/**
 * Parse and structurally validate a workflow file's text into a ParsedWorkflowDocument,
 * or return an error (runner-GUI doc section 6, step 1). This is a pure function: text
 * in, document or error out. It does NOT resolve ${params.*} (the daemon owns
 * resolution) and does not open files (the host reads the file and passes the text).
 *
 * Validation is the schema-level pass against the bundled schema; the daemon remains
 * authoritative and applies the deeper rules (parameter-default typing, acyclicity,
 * profile existence) at submit time.
 */
export function parseWorkflowDocument(text: string, format: 'yaml' | 'json'): WorkflowParseResult {
    let parsed: unknown;
    try {
        parsed = format === 'json' ? JSON.parse(text) : parseYaml(text);
    } catch (e) {
        return {ok: false, error: {kind: 'syntax', message: errorMessage(e)}};
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {ok: false, error: {kind: 'schema', message: 'The workflow file must be a mapping/object.'}};
    }

    const schemaResult = validateAgainstSchema(parsed);
    if (!schemaResult.valid) {
        return {ok: false, error: {kind: 'schema', message: formatSchemaErrors(schemaResult.errors)}};
    }

    return {ok: true, document: toDocument(parsed as RawWorkflow, text, format)};
}

/** Shape of the fields we read from a schema-valid document (already validated). */
interface RawWorkflow {
    metadata?: {name?: string};
    spec: {
        parameters?: RawParameter[];
        steps: RawStep[];
    };
}

interface RawParameter {
    name: string;
    type: WorkflowParameterType;
    required?: boolean;
    default?: string | number | boolean | string[];
    pattern?: string;
    min?: number;
    max?: number;
    values?: string[];
}

interface RawStep {
    id: string;
    name?: string;
    type: WorkflowStepSummary['type'];
}

/** Build the ParsedWorkflowDocument from a schema-valid raw object. */
function toDocument(raw: RawWorkflow, text: string, format: 'yaml' | 'json'): ParsedWorkflowDocument {
    return {
        name: raw.metadata?.name ?? FALLBACK_NAME,
        parameters: (raw.spec.parameters ?? []).map(toParameter),
        steps: raw.spec.steps.map((s) => ({id: s.id, name: s.name, type: s.type})),
        documentText: text,
        format,
    };
}

/** Normalize a raw schema parameter into the runner's WorkflowParameter model. */
function toParameter(raw: RawParameter): WorkflowParameter {
    const param: WorkflowParameter = {
        name: raw.name,
        type: raw.type,
        required: raw.required ?? false,
        ...(raw.default !== undefined ? {default: raw.default} : {}),
        ...(raw.pattern !== undefined ? {pattern: raw.pattern} : {}),
        ...(raw.min !== undefined ? {min: raw.min} : {}),
        ...(raw.max !== undefined ? {max: raw.max} : {}),
        ...(raw.values !== undefined ? {values: raw.values} : {}),
    };
    return param;
}

/** Join ajv errors into a readable, single-line-per-error message. */
function formatSchemaErrors(errors: {instancePath: string; message?: string}[]): string {
    /* c8 ignore next 3 -- justified-unreachable: this is only called on a schema failure,
       and ajv always populates a non-empty errors array on failure; the empty-list branch
       is a defense in case ajv ever reports invalid with no errors. */
    if (errors.length === 0) {
        return 'The workflow file does not match the schema.';
    }
    return errors
        .map((e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`)
        .join('; ');
}

/** Extract a human-readable message from a thrown value. */
function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
