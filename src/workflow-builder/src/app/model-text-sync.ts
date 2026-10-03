import { documentToText, textToDocument, type EditorFormat } from '../editor/editor-text';
import { fromWorkflow, toWorkflow } from '../workflow/serializer';
import { validateWorkflow } from '../schema/loader';
import type { WorkflowDocument, WorkflowGraph } from '../workflow/graph';

// The model<->text sync seam (docs section 10): both views project from the single
// source-of-truth graph model. graphToText is the canvas->editor direction;
// textToGraph is the editor->canvas direction, gated on parse + schema validity so an
// invalid in-progress edit never corrupts the model (the canvas holds its last valid
// render instead).

// Serialize the graph model to canonical editor text.
export function graphToText(graph: WorkflowGraph, format: EditorFormat): string {
    return documentToText(toWorkflow(graph), format);
}

// Parse editor text back into a graph model, or undefined when the text does not
// parse or fails schema validation. A schema-invalid document is rejected here so the
// model only ever holds a document the daemon would accept; the editor still shows the
// per-error annotations via the separate validateText pipeline.
export function textToGraph(text: string, format: EditorFormat): WorkflowGraph | undefined {
    const parsed = textToDocument(text, format);
    if (!parsed.ok) {
        return undefined;
    }
    if (!validateWorkflow(parsed.document).valid) {
        return undefined;
    }
    return fromWorkflow(parsed.document as WorkflowDocument);
}
