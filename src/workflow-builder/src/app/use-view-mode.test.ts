import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewMode, VIEW_MODES, type ViewMode } from './use-view-mode';

describe('useViewMode', () => {
    it('defaults to the visual mode', () => {
        const { result } = renderHook(() => useViewMode());
        expect(result.current.mode).toBe('visual');
    });

    it('accepts an explicit initial mode', () => {
        const { result } = renderHook(() => useViewMode('split'));
        expect(result.current.mode).toBe('split');
    });

    it('switches to another mode', () => {
        const { result } = renderHook(() => useViewMode());
        act(() => result.current.setMode('editor'));
        expect(result.current.mode).toBe('editor');
    });

    it('exposes the three canonical modes in display order', () => {
        expect(VIEW_MODES).toEqual([
            'visual',
            'editor',
            'split',
        ]);
    });

    it('reports which panes are visible for each mode', () => {
        const visible = (mode: ViewMode): { canvas: boolean; editor: boolean } => {
            const { result } = renderHook(() => useViewMode(mode));
            return { canvas: result.current.showCanvas, editor: result.current.showEditor };
        };
        expect(visible('visual')).toEqual({ canvas: true, editor: false });
        expect(visible('editor')).toEqual({ canvas: false, editor: true });
        expect(visible('split')).toEqual({ canvas: true, editor: true });
    });
});
