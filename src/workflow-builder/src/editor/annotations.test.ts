import { describe, it, expect } from 'vitest';
import { errorsToAnnotations } from './annotations';

describe('errorsToAnnotations', () => {
    it('returns no annotations for an empty error list', () => {
        expect(errorsToAnnotations([])).toEqual([]);
    });

    it('maps each error message to a document-level error annotation (v1: row 0)', () => {
        const anns = errorsToAnnotations(['must have required property \'kind\'', 'unknown step type: X']);
        expect(anns).toEqual([
            { row: 0, column: 0, text: 'must have required property \'kind\'', type: 'error' }, { row: 0, column: 0, text: 'unknown step type: X', type: 'error' },
        ]);
    });

    it('prefixes each annotation with a schema-error label for clarity', () => {
        const anns = errorsToAnnotations(['bad'], { label: 'Schema' });
        expect(anns[0].text).toBe('Schema: bad');
    });
});
