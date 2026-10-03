import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import type { WorkflowGraphController } from './use-workflow-graph';
import type { WorkflowNode } from '../nodes/descriptor';
import type { NodePatch } from './graph-mutations';

// The pane composes the palette, the canvas, the layout toolbar and the property
// modal; mock the heavy children (palette and canvas already unit-tested; canvas wraps
// un-renderable React Flow) and ReactFlowProvider at the module boundary. The canvas
// mock exposes an edit trigger so the modal open path is reachable. The property modal
// is mocked to a thin harness that surfaces its node and fires save/delete/dismiss.
vi.mock('./node-palette', () => ({
    NodePalette: ({ onAdd }: { onAdd: (t: string) => void }) => (
        <button type="button" data-testid="palette" onClick={() => onAdd('Job')}>palette</button>
    ),
}));
vi.mock('./workflow-canvas', () => ({
    WorkflowCanvas: ({ onEditNode }: { onEditNode: (id: string) => void }) => (
        <button type="button" data-testid="edit-a" onClick={() => onEditNode('a')}>canvas</button>
    ),
}));
vi.mock('@xyflow/react', () => ({
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../modal/property-modal', () => ({
    PropertyModal: ({ node, onSave, onDelete, onDismiss }: {
        node: WorkflowNode | null;
        onSave: (id: string, patch: NodePatch) => void;
        onDelete: (id: string) => void;
        onDismiss: () => void;
    }) => (node === null ? null : (
        <div data-testid="modal">
            <span data-testid="modal-node">{node.id}</span>
            <button type="button" data-testid="modal-save" onClick={() => onSave(node.id, { name: 'X' })}>save</button>
            <button type="button" data-testid="modal-delete" onClick={() => onDelete(node.id)}>del</button>
            <button type="button" data-testid="modal-dismiss" onClick={onDismiss}>x</button>
        </div>
    )),
}));

import { CanvasPane } from './canvas-pane';

function controllerStub(overrides: Partial<WorkflowGraphController> = {}): WorkflowGraphController {
    return {
        graph: { nodes: [{ id: 'a', type: 'Sleep', with: {}, continueOnError: false }], edges: [] },
        positions: [],
        addNode: vi.fn(),
        deleteNode: vi.fn(),
        updateNode: vi.fn(),
        connect: vi.fn(),
        deleteEdge: vi.fn(),
        moveNode: vi.fn(),
        isValidConnection: vi.fn(),
        relayout: vi.fn(),
        setGraph: vi.fn(),
        ...overrides,
    };
}

describe('CanvasPane', () => {
    it('renders the palette and the canvas', () => {
        render(<CanvasPane controller={controllerStub()} />);
        expect(screen.getByTestId('palette')).toBeInTheDocument();
        expect(screen.getByTestId('edit-a')).toBeInTheDocument();
    });

    it('adds a node through the palette', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} />);
        fireEvent.click(screen.getByTestId('palette'));
        expect(controller.addNode).toHaveBeenCalledWith('Job');
    });

    it('re-runs layout when the re-layout button is clicked', () => {
        const controller = controllerStub();
        const { container } = render(<CanvasPane controller={controller} />);
        createWrapper(container).findButton('[data-testid="relayout"]')!.click();
        expect(controller.relayout).toHaveBeenCalled();
    });

    it('keeps the modal closed until a node is edited', () => {
        render(<CanvasPane controller={controllerStub()} />);
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('opens the modal for the double-clicked node', () => {
        render(<CanvasPane controller={controllerStub()} />);
        fireEvent.click(screen.getByTestId('edit-a'));
        expect(screen.getByTestId('modal-node').textContent).toBe('a');
    });

    it('saves an edit through the controller and closes the modal', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} />);
        fireEvent.click(screen.getByTestId('edit-a'));
        fireEvent.click(screen.getByTestId('modal-save'));
        expect(controller.updateNode).toHaveBeenCalledWith('a', { name: 'X' });
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('deletes a node through the controller and closes the modal', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} />);
        fireEvent.click(screen.getByTestId('edit-a'));
        fireEvent.click(screen.getByTestId('modal-delete'));
        expect(controller.deleteNode).toHaveBeenCalledWith('a');
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('dismisses the modal without mutating', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} />);
        fireEvent.click(screen.getByTestId('edit-a'));
        fireEvent.click(screen.getByTestId('modal-dismiss'));
        expect(controller.updateNode).not.toHaveBeenCalled();
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });
});

