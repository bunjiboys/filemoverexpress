import type { EditorFormat } from '../editor/editor-text';
import type { WorkflowGraph } from '../workflow/graph';

const DEFAULT_BASE = 'workflow';

// Derive a default export file name from the workflow's metadata name and the chosen
// format (docs section 6). The metadata name is slugified to a filesystem-safe base;
// an absent or empty-after-slug name falls back to "workflow". The extension is the
// format (yaml/json).
export function exportFileName(graph: WorkflowGraph, format: EditorFormat): string {
    const slug = slugify(graph.metadata?.name ?? '');
    const base = slug === '' ? DEFAULT_BASE : slug;
    return `${base}.${format}`;
}

// Lowercase, replace any run of non-alphanumeric characters with a single hyphen, and
// trim leading/trailing hyphens, so an arbitrary workflow name becomes a safe file
// base.
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// The MIME type for a format, used when writing the download blob.
export function mimeType(format: EditorFormat): string {
    return format === 'json' ? 'application/json' : 'application/yaml';
}
