import { describe, it, expect } from 'vitest';
import { clampRatio, ratioFromPointer, MIN_RATIO, MAX_RATIO } from './split-ratio';

// Split view lets the user drag the divider between the canvas and editor. The ratio
// (left pane fraction of the container) is clamped so neither pane collapses, and is
// derived from the pointer position relative to the container. Pure so the drag math
// is unit-tested without a real pointer.
describe('clampRatio', () => {
    it('keeps a mid-range ratio unchanged', () => {
        expect(clampRatio(0.5)).toBe(0.5);
    });

    it('clamps below the minimum up to MIN_RATIO', () => {
        expect(clampRatio(0.01)).toBe(MIN_RATIO);
        expect(clampRatio(-5)).toBe(MIN_RATIO);
    });

    it('clamps above the maximum down to MAX_RATIO', () => {
        expect(clampRatio(0.99)).toBe(MAX_RATIO);
        expect(clampRatio(5)).toBe(MAX_RATIO);
    });
});

describe('ratioFromPointer', () => {
    it('returns the pointer fraction across the container', () => {
        // container from x=100, width=400; pointer at 300 => (300-100)/400 = 0.5
        expect(ratioFromPointer(100, 400, 300)).toBe(0.5);
    });

    it('clamps the result so a drag past the edge does not collapse a pane', () => {
        expect(ratioFromPointer(0, 100, 1000)).toBe(MAX_RATIO); // far right
        expect(ratioFromPointer(0, 100, -50)).toBe(MIN_RATIO); // far left
    });

    it('treats a zero-width container as the minimum (avoids divide-by-zero blowup)', () => {
        expect(ratioFromPointer(0, 0, 0)).toBe(MIN_RATIO);
    });
});
