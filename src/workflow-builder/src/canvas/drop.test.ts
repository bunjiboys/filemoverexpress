import { describe, it, expect, vi } from 'vitest';
import { readDroppedStepType } from './drop';
import { PALETTE_DRAG_TYPE } from './node-palette';
import { STEP_TYPES } from '../schema/loader';

// A canvas drop carries the dragged step type on the dataTransfer under
// PALETTE_DRAG_TYPE. readDroppedStepType pulls it out and guards it against the known
// step types, so a stray drop (text, a file) does not add a bogus node.
describe('readDroppedStepType', () => {
    it('returns the step type for a valid palette drop', () => {
        const getData = vi.fn().mockReturnValue(STEP_TYPES[0]);
        expect(readDroppedStepType({ getData })).toBe(STEP_TYPES[0]);
        expect(getData).toHaveBeenCalledWith(PALETTE_DRAG_TYPE);
    });

    it('returns undefined when the payload is empty', () => {
        const getData = vi.fn().mockReturnValue('');
        expect(readDroppedStepType({ getData })).toBeUndefined();
    });

    it('returns undefined when the payload is not a known step type', () => {
        const getData = vi.fn().mockReturnValue('NotAStepType');
        expect(readDroppedStepType({ getData })).toBeUndefined();
    });
});
