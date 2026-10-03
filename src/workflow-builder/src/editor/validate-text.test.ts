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
