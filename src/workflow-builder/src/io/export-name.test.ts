import { describe, it, expect } from 'vitest';
import { exportFileName, mimeType } from './export-name';
import type { WorkflowGraph } from '../workflow/graph';

const graph = (name?: string): WorkflowGraph => ({
    nodes: [],
    edges: [],
    metadata: name === undefined ? undefined : { name },
});

// Export derives a sensible default file name from the workflow and the chosen format
// (docs section 6). Pure, so the name/extension logic is unit-tested without touching
// a file dialog.
describe('exportFileName', () => {
    it('uses a default base name when the workflow has no metadata name', () => {
        expect(exportFileName(graph(), 'yaml')).toBe('workflow.yaml');
        expect(exportFileName(graph(), 'json')).toBe('workflow.json');
    });

    it('slugifies the metadata name into the base', () => {
        expect(exportFileName(graph('My Nightly Backup'), 'yaml')).toBe('my-nightly-backup.yaml');
    });

    it('strips unsafe characters and collapses separators', () => {
        expect(exportFileName(graph('a/b: c**d'), 'json')).toBe('a-b-c-d.json');
    });

    it('falls back to the default base when the name slugifies to empty', () => {
        expect(exportFileName(graph('***'), 'yaml')).toBe('workflow.yaml');
    });

    it('uses the format as the extension', () => {
        expect(exportFileName(graph('x'), 'json')).toBe('x.json');
        expect(exportFileName(graph('x'), 'yaml')).toBe('x.yaml');
    });
});

describe('mimeType', () => {
    it('maps json to application/json', () => {
        expect(mimeType('json')).toBe('application/json');
    });

    it('maps yaml to application/yaml', () => {
        expect(mimeType('yaml')).toBe('application/yaml');
    });
});
