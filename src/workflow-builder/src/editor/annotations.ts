import type { Annotation } from './lazy-code-editor';

export interface AnnotationOptions {
    // Optional label prefixed to each message (for example 'Schema'), so a reader can
    // tell where the problem came from.
    label?: string;
}

// Convert validation error messages (from the ajv/graph validation layer) into Ace
// annotations for CodeEditor. CodeEditor/Ace does no schema validation itself, so
// these are the inline markers for schema and structural problems.
//
// v1 maps every error to a document-level annotation (row 0): ajv reports JSON-pointer
// instancePaths, not editor line/column, and precise position mapping (via the yaml
// library's LineCounter) is a later refinement. The message text carries the detail.
export function errorsToAnnotations(errors: string[], options: AnnotationOptions = {}): Annotation[] {
    return errors.map((message) => ({
        row: 0,
        column: 0,
        text: options.label !== undefined ? `${options.label}: ${message}` : message,
        type: 'error' as const,
    }));
}
