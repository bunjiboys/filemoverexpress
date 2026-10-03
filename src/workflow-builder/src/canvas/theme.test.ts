import { describe, it, expect } from 'vitest';
import { surfaceColors, UI_FONT_FAMILY } from './theme';

// The canvas node and the right-click menu render inside React Flow's own DOM, where
// Cloudscape's container CSS variables do not resolve, so a var()-with-light-fallback
// shows white in dark mode. These explicit per-mode colors fix that: a dark blue
// (slightly lighter than the canvas background) in dark mode, a light surface in light
// mode, each paired with a readable text and border color.
describe('surfaceColors', () => {
    it('returns a readable light surface in light mode', () => {
        const c = surfaceColors('light');
        expect(c.background).toBe('#ffffff');
        expect(c.text).toBe('#000716');
    });

    it('returns a dark-blue surface and light text in dark mode', () => {
        const c = surfaceColors('dark');
        // Lighter than the dark canvas background, not pure black or white.
        expect(c.background.toLowerCase()).not.toBe('#ffffff');
        expect(c.background.toLowerCase()).not.toBe('#000000');
        expect(c.text).toBe('#ffffff');
    });

    it('provides a border color for each mode', () => {
        expect(surfaceColors('light').border).toBeTruthy();
        expect(surfaceColors('dark').border).toBeTruthy();
    });
});

describe('UI_FONT_FAMILY', () => {
    it('references the Cloudscape font variable with a sans-serif fallback', () => {
        expect(UI_FONT_FAMILY).toContain('--font-family-base');
        expect(UI_FONT_FAMILY).toContain('sans-serif');
    });
});
