import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// applyMode is the Cloudscape side effect; mock it so the hook is testable without
// touching the real document, and so we can assert it is driven correctly.
const applyMode = vi.fn();
vi.mock('@cloudscape-design/global-styles', () => ({
    Mode: { Light: 'light', Dark: 'dark' },
    applyMode: (mode: string) => applyMode(mode),
}));

import { useColorMode, COLOR_MODE_KEY } from './use-color-mode';

describe('useColorMode', () => {
    beforeEach(() => {
        applyMode.mockClear();
        localStorage.clear();
    });

    it('defaults to light when nothing is stored', () => {
        const { result } = renderHook(() => useColorMode());
        expect(result.current.mode).toBe('light');
    });

    it('restores a stored dark preference', () => {
        localStorage.setItem(COLOR_MODE_KEY, 'dark');
        const { result } = renderHook(() => useColorMode());
        expect(result.current.mode).toBe('dark');
    });

    it('applies the current mode to Cloudscape on mount', () => {
        localStorage.setItem(COLOR_MODE_KEY, 'dark');
        renderHook(() => useColorMode());
        expect(applyMode).toHaveBeenCalledWith('dark');
    });

    it('toggles between light and dark', () => {
        const { result } = renderHook(() => useColorMode());
        act(() => result.current.toggle());
        expect(result.current.mode).toBe('dark');
        act(() => result.current.toggle());
        expect(result.current.mode).toBe('light');
    });

    it('persists and applies the mode when toggled', () => {
        const { result } = renderHook(() => useColorMode());
        act(() => result.current.toggle());
        expect(localStorage.getItem(COLOR_MODE_KEY)).toBe('dark');
        expect(applyMode).toHaveBeenLastCalledWith('dark');
    });
});
