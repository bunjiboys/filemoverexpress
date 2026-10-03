import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentDrawer } from './document-drawer';
import type { WorkflowGraph } from '../workflow/graph';

const graph: WorkflowGraph = { nodes: [], edges: [], metadata: { name: 'Flow' } };

// A right-anchored overlay panel for the document fields (metadata/parameters/
// defaults). It floats over the content so opening it does not shift the canvas or
// editor, and closes via its own button or Escape. The field editing lives in
// DocumentPanel (tested separately); this covers the drawer shell: visibility, the
// fixed-overlay positioning, and the close affordances.
describe('DocumentDrawer', () => {
    it('renders nothing when closed', () => {
        render(<DocumentDrawer open={false} graph={graph} onChange={vi.fn()} onClose={vi.fn()} />);
        expect(screen.queryByTestId('document-drawer')).not.toBeInTheDocument();
    });

    it('renders the panel when open', () => {
        render(<DocumentDrawer open graph={graph} onChange={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByTestId('document-drawer')).toBeInTheDocument();
        expect(screen.getByTestId('meta-name')).toBeInTheDocument();
    });

    it('is a fixed overlay so it does not shift the page', () => {
        render(<DocumentDrawer open graph={graph} onChange={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByTestId('document-drawer').style.position).toBe('fixed');
    });

    it('closes from its close button', () => {
        const onClose = vi.fn();
        render(<DocumentDrawer open graph={graph} onChange={vi.fn()} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('document-drawer-close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<DocumentDrawer open graph={graph} onChange={vi.fn()} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('does not listen for Escape when closed', () => {
        const onClose = vi.fn();
        render(<DocumentDrawer open={false} graph={graph} onChange={vi.fn()} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores non-Escape keys', () => {
        const onClose = vi.fn();
        render(<DocumentDrawer open graph={graph} onChange={vi.fn()} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'a' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('forwards document edits to onChange', () => {
        const onChange = vi.fn();
        render(<DocumentDrawer open graph={graph} onChange={onChange} onClose={vi.fn()} />);
        const input = screen.getByTestId('meta-name').querySelector('input')!;
        fireEvent.change(input, { target: { value: 'X' } });
        expect(onChange).toHaveBeenCalled();
    });
});
