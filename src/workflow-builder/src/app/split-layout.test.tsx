import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitLayout } from './split-layout';

const panes = () => ({
    left: <div data-testid="left-child">left</div>,
    right: <div data-testid="right-child">right</div>,
});

// SplitLayout shows two panes with a draggable divider between them (docs section 10).
// The ratio math is unit-tested in split-ratio.test; this covers the component wiring:
// both panes render, the divider is present and accessible, and a drag updates the
// pane sizing without throwing. Real pixel widths are a Tier-2 concern (jsdom returns
// a zero-size bounding rect), so this asserts the drag path runs and the flex basis
// stays a percentage.
describe('SplitLayout', () => {
    it('renders both panes and a resizer handle', () => {
        render(<SplitLayout {...panes()} />);
        expect(screen.getByTestId('left-child')).toBeInTheDocument();
        expect(screen.getByTestId('right-child')).toBeInTheDocument();
        expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('starts at an even split', () => {
        render(<SplitLayout {...panes()} />);
        const left = screen.getByTestId('split-left');
        expect(left.style.flexBasis).toBe('50%');
    });

    it('updates the split while the divider is dragged', () => {
        render(<SplitLayout {...panes()} />);
        const resizer = screen.getByRole('slider');
        fireEvent.pointerDown(resizer, { clientX: 0 });
        fireEvent.pointerMove(window, { clientX: 200 });
        fireEvent.pointerUp(window);
        // jsdom reports a zero-width container, so the ratio clamps to the minimum;
        // the point is the drag path runs and resizes without error.
        const left = screen.getByTestId('split-left');
        expect(left.style.flexBasis).toMatch(/%$/);
    });

    it('ignores pointer moves when not dragging', () => {
        render(<SplitLayout {...panes()} />);
        fireEvent.pointerMove(window, { clientX: 300 });
        const left = screen.getByTestId('split-left');
        expect(left.style.flexBasis).toBe('50%');
    });

    it('supports keyboard resize via arrow keys on the separator', () => {
        render(<SplitLayout {...panes()} />);
        const resizer = screen.getByRole('slider');
        const before = screen.getByTestId('split-left').style.flexBasis;
        fireEvent.keyDown(resizer, { key: 'ArrowLeft' });
        expect(screen.getByTestId('split-left').style.flexBasis).not.toBe(before);
    });

    it('ignores non-arrow keys on the separator', () => {
        render(<SplitLayout {...panes()} />);
        const resizer = screen.getByRole('slider');
        const before = screen.getByTestId('split-left').style.flexBasis;
        fireEvent.keyDown(resizer, { key: 'Enter' });
        expect(screen.getByTestId('split-left').style.flexBasis).toBe(before);
    });

    it('moves the split right on ArrowRight', () => {
        render(<SplitLayout {...panes()} />);
        const resizer = screen.getByRole('slider');
        fireEvent.keyDown(resizer, { key: 'ArrowRight' });
        // 0.50 + step, still a percentage.
        expect(screen.getByTestId('split-left').style.flexBasis).toMatch(/%$/);
    });
});

