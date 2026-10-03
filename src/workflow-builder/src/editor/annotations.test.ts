import { describe, it, expect } from 'vitest';
import { errorsToAnnotations } from './annotations';

// errorsToAnnotations turns validation problems into Ace annotations. Each problem is
// a message plus an optional source position (row/column); when a position is absent
// the annotation defaults to the document start (row 0), used for whole-document
// problems like a parse failure.
describe('errorsToAnnotations', () => {
    it('returns no annotations for an empty error list', () => {
        expect(errorsToAnnotations([])).toEqual([]);
    });

    it('defaults a positionless error to the document start', () => {
        const anns = errorsToAnnotations([{ message: 'unknown step type: X' }]);
        expect(anns).toEqual([
            { row: 0, column: 0, text: 'unknown step type: X', type: 'error' },
        ]);
    });

    it('places an error at its given row and column', () => {
        const anns = errorsToAnnotations([{ message: 'bad', row: 4, column: 2 }]);
        expect(anns[0]).toEqual({ row: 4, column: 2, text: 'bad', type: 'error' });
    });

    it('prefixes each annotation with a label for clarity', () => {
        const anns = errorsToAnnotations([{ message: 'bad' }], { label: 'Schema' });
        expect(anns[0].text).toBe('Schema: bad');
    });

    it('accepts plain strings as positionless errors for convenience', () => {
        const anns = errorsToAnnotations(['oops'], { label: 'Parse' });
        expect(anns[0]).toEqual({ row: 0, column: 0, text: 'Parse: oops', type: 'error' });
    });
});
