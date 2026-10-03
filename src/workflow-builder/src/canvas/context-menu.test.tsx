import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from './context-menu';

const items = (onPick: (id: string) => void) => [
    { id: 'edit', label: 'Edit', onSelect: () => onPick('edit') },
    { id: 'delete', label: 'Delete', onSelect: () => onPick('delete') },
    { id: 'clear', label: 'Clear connections', onSelect: () => onPick('clear') },
];

// A small positioned popover for right-click actions on a node or edge. It renders the
// given items at the given screen position, invokes an item's handler on click, and
// dismisses on outside click or Escape. Positioning over the zoomed canvas is a Tier-2
// concern; this covers the menu wiring.
describe('ContextMenu', () => {
    it('renders each item at the given position', () => {
        render(<ContextMenu x={10} y={20} items={items(vi.fn())} colorMode="light" onDismiss={vi.fn()} />);
        expect(screen.getByRole('menu')).toBeInTheDocument();
        expect(screen.getByText('Edit')).toBeInTheDocument();
        expect(screen.getByText('Clear connections')).toBeInTheDocument();
    });

    it('calls an item onSelect and then dismisses when clicked', () => {
        const onDismiss = vi.fn();
        const onPick = vi.fn();
        render(<ContextMenu x={0} y={0} items={items(onPick)} colorMode="light" onDismiss={onDismiss} />);
        fireEvent.click(screen.getByText('Clear connections'));
        expect(onPick).toHaveBeenCalledWith('clear');
        expect(onDismiss).toHaveBeenCalled();
    });

    it('dismisses on an outside pointer down', () => {
        const onDismiss = vi.fn();
        render(<ContextMenu x={0} y={0} items={items(vi.fn())} colorMode="light" onDismiss={onDismiss} />);
        fireEvent.pointerDown(document.body);
        expect(onDismiss).toHaveBeenCalled();
    });

    it('does not dismiss when clicking inside the menu', () => {
        const onDismiss = vi.fn();
        render(<ContextMenu x={0} y={0} items={items(vi.fn())} colorMode="light" onDismiss={onDismiss} />);
        fireEvent.pointerDown(screen.getByRole('menu'));
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it('dismisses on Escape', () => {
        const onDismiss = vi.fn();
        render(<ContextMenu x={0} y={0} items={items(vi.fn())} colorMode="light" onDismiss={onDismiss} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onDismiss).toHaveBeenCalled();
    });

    it('ignores other keys', () => {
        const onDismiss = vi.fn();
        render(<ContextMenu x={0} y={0} items={items(vi.fn())} colorMode="light" onDismiss={onDismiss} />);
        fireEvent.keyDown(document, { key: 'a' });
        expect(onDismiss).not.toHaveBeenCalled();
    });
});


