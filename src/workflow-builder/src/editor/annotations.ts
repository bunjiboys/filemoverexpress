import type { Annotation } from './lazy-code-editor';

export interface AnnotationOptions {
    // Optional label prefixed to each message (for example 'Schema'), so a reader can
    // tell where the problem came from.
    label?: string;
}

// A validation problem to annotate: a message, and an optional source position. A
// problem with no position (a parse failure, a whole-document rule) defaults to the
// document start.
export interface AnnotatableError {
    message: string;
    row?: number;
    column?: number;
}

// Convert validation problems (from the parse/schema/graph layers) into Ace
// annotations for CodeEditor, which does no schema validation itself. Each problem may
// carry a source position; schema errors are positioned by mapping their ajv
// instancePath to a line (see source-position), so an annotation lands on the
// offending line instead of defaulting to line 1 (docs section 10). A plain string is
// accepted as a convenience for positionless errors.
export function errorsToAnnotations(
    errors: (AnnotatableError | string)[],
    options: AnnotationOptions = {},
): Annotation[] {
    return errors.map((error) => {
        const e: AnnotatableError = typeof error === 'string' ? { message: error } : error;
        return {
            row: e.row ?? 0,
            column: e.column ?? 0,
            text: options.label !== undefined ? `${options.label}: ${e.message}` : e.message,
            type: 'error' as const,
        };
    });
}
