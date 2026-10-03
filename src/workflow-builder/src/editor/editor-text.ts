import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { WorkflowDocument } from '../workflow/graph';

// The Editor pane renders the canonical workflow document as text in one of two
// formats; YAML is the authored default, JSON the toggle (docs section 10).
export type EditorFormat = 'yaml' | 'json';

export type ParseResult =
    | { ok: true; document: WorkflowDocument }
    | { ok: false; error: string };

// Render a document as editor text. The output is the canonical serialization for
// the format, so documentToText -> textToDocument round-trips.
export function documentToText(doc: WorkflowDocument, format: EditorFormat): string {
    if (format === 'json') {
        return JSON.stringify(doc, null, 4);
    }
    return stringifyYaml(doc);
}

// Parse editor text back to a document. Returns an error result rather than throwing,
// so the editor can hold its last valid render and surface the message while the user
// is mid-edit (docs section 10).
export function textToDocument(text: string, format: EditorFormat): ParseResult {
    try {
        const parsed = format === 'json' ? JSON.parse(text) : parseYaml(text);
        return { ok: true, document: parsed as WorkflowDocument };
    } catch (err) {
        // Both JSON.parse and yaml.parse throw on malformed input; normalize to a
        // message string for display.
        return { ok: false, error: String(err) };
    }
}
