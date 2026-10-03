import type { FileAccess, OpenedFile } from './file-access';
import { formatForFileName } from './import-text';
import { exportFileName } from './export-name';
import { graphToText, textToGraph } from '../app/model-text-sync';
import type { EditorFormat } from '../editor/editor-text';
import type { WorkflowGraph } from '../workflow/graph';

// The outcome of an import attempt. `imported` carries the parsed graph plus the text
// and format so the app can set the model AND seed the editor view; `invalid` names
// the file whose content failed to parse/validate; `cancelled` is a dismissed dialog.
export type ImportResult =
    | { status: 'imported'; graph: WorkflowGraph; text: string; format: EditorFormat; name: string }
    | { status: 'invalid'; name: string }
    | { status: 'cancelled' };

// Import a workflow (docs sections 6, 9). With no `provided` file it opens one through
// the FileAccess seam; `provided` lets a file-drop skip the dialog. The format is
// inferred from the file name, then the text is parsed+validated to a graph; a file
// that does not validate yields `invalid` rather than corrupting the model.
export async function importWorkflow(
    access: FileAccess,
    provided?: OpenedFile,
): Promise<ImportResult> {
    const file = provided ?? await access.open();
    if (file === undefined) {
        return { status: 'cancelled' };
    }
    const format = formatForFileName(file.name);
    const graph = textToGraph(file.text, format);
    if (graph === undefined) {
        return { status: 'invalid', name: file.name };
    }
    return { status: 'imported', graph, text: file.text, format, name: file.name };
}

// Export the current graph (docs section 6): serialize to the chosen format and save
// it through the seam under a name derived from the workflow's metadata.
export async function exportWorkflow(
    access: FileAccess,
    graph: WorkflowGraph,
    format: EditorFormat,
): Promise<void> {
    await access.save(exportFileName(graph, format), graphToText(graph, format), format);
}
