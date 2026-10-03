import type { EditorFormat } from '../editor/editor-text';

// Infer the editor format for an imported file from its extension (docs section 6):
// .json is JSON; .yaml/.yml and anything else is YAML (the authored default, and a
// superset that also parses JSON). Case-insensitive, last extension wins.
export function formatForFileName(fileName: string): EditorFormat {
    const dot = fileName.lastIndexOf('.');
    const ext = dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
    return ext === 'json' ? 'json' : 'yaml';
}
