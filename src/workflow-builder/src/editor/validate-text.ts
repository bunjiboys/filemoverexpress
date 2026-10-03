import { textToDocument, type EditorFormat } from './editor-text';
import { validateWorkflow } from '../schema/loader';
import { fromWorkflow } from '../workflow/serializer';
import { validateGraph } from '../workflow/validate-graph';
import { errorsToAnnotations, type AnnotatableError } from './annotations';
import { instancePathToPosition } from './source-position';
import type { Annotation } from './lazy-code-editor';
import type { WorkflowDocument } from '../workflow/graph';

// The editor validation pipeline (docs section 10): since the CodeEditor does no
// schema validation itself, we run text through our own layer on each change and
// return Ace annotations to display.
//
// Stages, each producing annotations and short-circuiting when it cannot proceed:
//   1. parse (YAML/JSON) - a parse error is a single document-level annotation.
//   2. schema validate against the bundled v1.json - each error is positioned on the
//      line its ajv instancePath addresses.
//   3. structural graph validation (unique ids, acyclic, edge integrity) - only when
//      the document is schema-valid enough to build a graph.
export function validateText(text: string, format: EditorFormat): Annotation[] {
    const parsed = textToDocument(text, format);
    if (!parsed.ok) {
        return errorsToAnnotations([parsed.error], { label: 'Parse' });
    }

    const schema = validateWorkflow(parsed.document);
    if (!schema.valid) {
        return errorsToAnnotations(schema.errors.map((e) => schemaError(e, text)), { label: 'Schema' });
    }

    const graph = fromWorkflow(parsed.document as WorkflowDocument);
    const structural = validateGraph(graph);
    if (!structural.valid) {
        return errorsToAnnotations(structural.errors, { label: 'Graph' });
    }

    return [];
}

// Turn one ajv error into a positioned annotation input: a readable message plus the
// source line/column its instancePath points at (when it resolves). A path that does
// not resolve to a node leaves the error positionless (document start).
function schemaError(err: { instancePath: string; message?: string }, text: string): AnnotatableError {
    const message = formatSchemaError(err);
    const position = instancePathToPosition(text, err.instancePath);
    if (position === undefined) {
        return { message };
    }
    return { message, row: position.row, column: position.column };
}

// Render an ajv error object into a readable one-line message. ajv always provides a
// string message and instancePath (empty for top-level errors); the path is prefixed
// when non-empty.
function formatSchemaError(err: { instancePath: string; message?: string }): string {
    const path = err.instancePath !== '' ? `${err.instancePath} ` : '';
    return `${path}${err.message}`.trim();
}
