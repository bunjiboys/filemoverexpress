import { describe, it, expect } from 'vitest';
import { documentToText, textToDocument, type EditorFormat } from './editor-text';
import { API_VERSION, KIND, type WorkflowDocument } from '../workflow/graph';

const doc: WorkflowDocument = {
    apiVersion: API_VERSION,
    kind: KIND,
    metadata: { name: 'nightly' },
    spec: {
        steps: [
            { id: 'a', type: 'Sleep', with: { duration: '30s' } },
        ],
    },
};

describe('documentToText', () => {
    it('renders YAML by default', () => {
        const text = documentToText(doc, 'yaml');
        expect(text).toContain('apiVersion: fme.dev/workflow/v1');
        expect(text).toContain('kind: Workflow');
        expect(text).toContain('duration: 30s');
    });

    it('renders pretty JSON when asked', () => {
        const text = documentToText(doc, 'json');
        expect(text.trimStart().startsWith('{')).toBe(true);
        expect(JSON.parse(text)).toEqual(doc);
    });
});

describe('textToDocument', () => {
    it('parses YAML to a document', () => {
        const result = textToDocument('apiVersion: fme.dev/workflow/v1\nkind: Workflow\nspec:\n  steps: []\n', 'yaml');
        expect(result.ok).toBe(true);
        expect(result.ok && result.document.kind).toBe('Workflow');
    });

    it('parses JSON to a document', () => {
        const result = textToDocument('{"apiVersion":"fme.dev/workflow/v1","kind":"Workflow","spec":{"steps":[]}}', 'json');
        expect(result.ok).toBe(true);
    });

    it('reports a parse error for malformed text instead of throwing', () => {
        const result = textToDocument('{ not: valid json', 'json');
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error.length).toBeGreaterThan(0);
    });

    it('reports a parse error for malformed YAML', () => {
        const result = textToDocument('{ unclosed: [1, 2', 'yaml');
        expect(result.ok).toBe(false);
    });
});

describe('round-trip', () => {
    it('textToDocument(documentToText(doc)) equals the document, for both formats', () => {
        for (const fmt of ['yaml', 'json'] as EditorFormat[]) {
            const parsed = textToDocument(documentToText(doc, fmt), fmt);
            expect(parsed.ok).toBe(true);
            expect(parsed.ok && parsed.document).toEqual(doc);
        }
    });
});
