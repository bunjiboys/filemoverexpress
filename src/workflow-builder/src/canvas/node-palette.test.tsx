import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import { NodePalette, PALETTE_DRAG_TYPE } from './node-palette';
import { STEP_TYPES } from '../schema/loader';

// The palette lists the schema-derived step types; dragging one onto the canvas (or
// clicking it) adds a node of that type (docs sections 4, 5). Drag is a Tier-2
// gesture, but the palette's dataTransfer payload and its click-to-add fallback are
// unit-testable here.
describe('NodePalette', () => {
    it('renders one draggable item per schema step type', () => {
        render(<NodePalette onAdd={vi.fn()} />);
        for (const type of STEP_TYPES) {
            const item = screen.getByTestId(`palette-${type}`);
            expect(createWrapper(item).findButton()).not.toBeNull();
        }
    });

    it('calls onAdd with the step type when a palette item is clicked', () => {
        const onAdd = vi.fn();
        render(<NodePalette onAdd={onAdd} />);
        createWrapper(screen.getByTestId('palette-Job')).findButton()!.click();
        expect(onAdd).toHaveBeenCalledWith('Job');
    });

    it('sets the step type on the drag payload when a drag starts', () => {
        render(<NodePalette onAdd={vi.fn()} />);
        const item = screen.getByTestId('palette-Sleep');
        const setData = vi.fn();
        fireEvent.dragStart(item, { dataTransfer: { setData } });
        expect(setData).toHaveBeenCalledWith(PALETTE_DRAG_TYPE, 'Sleep');
    });
});
