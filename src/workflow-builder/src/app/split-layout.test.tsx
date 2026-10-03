import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitLayout } from './split-layout';

const panes = () => ({
    left: <div data-testid="left-child">left</div>,
    right: <div data-testid="right-child">right</div>,
});

// SplitLayout shows two panes with a draggable divider between them (docs section 10).
// The ratio is controlled by the parent (so it survives a view switch), and the ratio
// math is unit-tested in split-ratio.test; this covers the component wiring: both
// panes render, the slider is present and accessible, and drag/keyboard emit new
// ratios. Real pixel widths are a Tier-2 concern (jsdom returns a zero-size bounding
// rect), so this asserts the handlers emit a clamped ratio.
describe('SplitLayout', () => {
    it('renders both panes and a resizer handle', () => {
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={vi.fn()} />);
        expect(screen.getByTestId('left-child')).toBeInTheDocument();
        expect(screen.getByTestId('right-child')).toBeInTheDocument();
        expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('sizes the left pane from the controlled ratio', () => {
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={vi.fn()} />);
        expect(screen.getByTestId('split-left').style.flexBasis).toBe('60%');
    });

    it('emits a new ratio while the divider is dragged', () => {
        const onRatioChange = vi.fn();
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={onRatioChange} />);
        const resizer = screen.getByRole('slider');
        fireEvent.pointerDown(resizer, { clientX: 0 });
        fireEvent.pointerMove(window, { clientX: 200 });
        fireEvent.pointerUp(window);
        // jsdom reports a zero-width container, so the emitted ratio clamps to the
        // minimum; the point is the drag path runs and emits a clamped value.
        expect(onRatioChange).toHaveBeenCalled();
        expect(onRatioChange.mock.calls[0][0]).toBeGreaterThanOrEqual(0.15);
    });

    it('does not emit when a pointer moves without a drag in progress', () => {
        const onRatioChange = vi.fn();
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={onRatioChange} />);
        fireEvent.pointerMove(window, { clientX: 300 });
        expect(onRatioChange).not.toHaveBeenCalled();
    });

    it('emits a smaller ratio on ArrowLeft', () => {
        const onRatioChange = vi.fn();
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={onRatioChange} />);
        fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
        expect(onRatioChange.mock.calls[0][0]).toBeCloseTo(0.55);
    });

    it('emits a larger ratio on ArrowRight', () => {
        const onRatioChange = vi.fn();
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={onRatioChange} />);
        fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
        expect(onRatioChange.mock.calls[0][0]).toBeCloseTo(0.65);
    });

    it('ignores non-arrow keys on the slider', () => {
        const onRatioChange = vi.fn();
        render(<SplitLayout {...panes()} ratio={0.6} onRatioChange={onRatioChange} />);
        fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
        expect(onRatioChange).not.toHaveBeenCalled();
    });
});
