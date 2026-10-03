import { describe, it, expect } from 'vitest';
import { validateText } from './validate-text';
import { API_VERSION, KIND } from '../workflow/graph';

const validDoc = JSON.stringify({
    apiVersion: API_VERSION,
    kind: KIND,
    spec: { steps: [{ id: 'a', type: 'Sleep', with: { duration: '1s' } }] },
});

describe('validateText', () => {
    it('returns no annotations for a valid document', () => {
        expect(validateText(validDoc, 'json')).toEqual([]);
    });

    it('returns a parse-error annotation for malformed text', () => {
        const anns = validateText('{ not valid', 'json');
        expect(anns.length).toBeGreaterThan(0);
        expect(anns[0].type).toBe('error');
    });

    it('returns schema-error annotations for a well-formed but invalid document', () => {
        const bad = JSON.stringify({ apiVersion: API_VERSION, kind: KIND, spec: { steps: [] } });
        const anns = validateText(bad, 'json');
        expect(anns.length).toBeGreaterThan(0);
    });

    it('formats a top-level schema error (empty instancePath) without a leading space', () => {
        // Missing required `kind` is a top-level error: ajv reports instancePath ''.
        const bad = JSON.stringify({ apiVersion: API_VERSION, spec: { steps: [] } });
        const anns = validateText(bad, 'json');
        expect(anns.length).toBeGreaterThan(0);
        expect(anns.every((a) => !a.text.includes('  '))).toBe(true);
    });

    it('positions a nested schema error on its source line, not line 1', () => {
        // An invalid `with` for a Sleep step (duration must be a string) sits deep in
        // the document; the annotation should land on that line, not default to row 0.
        const bad = [
            `apiVersion: ${API_VERSION}`,
            `kind: ${KIND}`,
            'spec:',
            '  steps:',
            '    - id: a',
            '      type: Sleep',
            '      with:',
            '        duration: 5',
            '',
        ].join('\n');
        const anns = validateText(bad, 'yaml');
        expect(anns.length).toBeGreaterThan(0);
        expect(anns.some((a) => a.row > 0)).toBe(true);
    });

    it('falls back to a positionless annotation when the position cannot be mapped', () => {
        // JSON.parse accepts duplicate keys (last wins) so textToDocument succeeds and
        // the schema stage runs, but the yaml parser used for position mapping rejects
        // the duplicate key, so instancePathToPosition returns undefined and the schema
        // annotation defaults to the document start.
        const bad = [
            '{',
            `  "apiVersion": "${API_VERSION}",`,
            `  "apiVersion": "${API_VERSION}",`,
            `  "kind": "${KIND}",`,
            '  "spec": { "steps": [] }',
            '}',
        ].join('\n');
        const anns = validateText(bad, 'json');
        expect(anns.length).toBeGreaterThan(0);
        expect(anns.every((a) => a.row === 0)).toBe(true);
    });

    it('returns graph-error annotations for duplicate step ids', () => {
        const dup = JSON.stringify({
            apiVersion: API_VERSION,
            kind: KIND,
            spec: {
                steps: [
                    { id: 'x', type: 'Sleep', with: { duration: '1s' } }, { id: 'x', type: 'Sleep', with: { duration: '2s' } },
                ],
            },
        });
        const anns = validateText(dup, 'json');
        expect(anns.some((a) => /duplicate id/i.test(a.text))).toBe(true);
    });
});
