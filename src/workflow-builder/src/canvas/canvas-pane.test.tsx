import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import type { WorkflowGraphController } from './use-workflow-graph';
import type { WorkflowNode } from '../nodes/descriptor';
import type { NodePatch } from './graph-mutations';

// The pane composes the add-step menu, the canvas, the layout toolbar and the property
// modal; mock the heavy children (menu and canvas already unit-tested; canvas wraps
// un-renderable React Flow) and ReactFlowProvider at the module boundary. The canvas
// mock exposes an edit trigger so the modal open path is reachable. The property modal
// is mocked to a thin harness that surfaces its node and fires save/delete/dismiss.
vi.mock('./add-step-menu', () => ({
    AddStepMenu: ({ onAdd }: { onAdd: (t: string) => void }) => (
        <button type="button" data-testid="palette" onClick={() => onAdd('Upload')}>add step</button>
    ),
}));
vi.mock('./workflow-canvas', () => ({
    WorkflowCanvas: ({ onEditNode, onContextMenu }: {
        onEditNode: (id: string) => void;
        onContextMenu: (t: { kind: 'node' | 'edge'; id: string; x: number; y: number }) => void;
    }) => (
        <div>
            <button type="button" data-testid="edit-a" onClick={() => onEditNode('a')}>canvas</button>
            <button
                type="button"
                data-testid="ctx-node"
                onClick={() => onContextMenu({ kind: 'node', id: 'a', x: 1, y: 2 })}
            >ctx node</button>
            <button
                type="button"
                data-testid="ctx-edge"
                onClick={() => onContextMenu({ kind: 'edge', id: 'a->b', x: 3, y: 4 })}
            >ctx edge</button>
            <button
                type="button"
                data-testid="ctx-edge-bad"
                onClick={() => onContextMenu({ kind: 'edge', id: 'notanedge', x: 3, y: 4 })}
            >ctx bad edge</button>
        </div>
    ),
}));
vi.mock('./context-menu', () => ({
    ContextMenu: ({ items, onDismiss }: {
        items: { id: string; label: string; onSelect: () => void }[];
        onDismiss: () => void;
    }) => (
        <div data-testid="context-menu">
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    data-testid={`ctx-item-${item.id}`}
                    onClick={() => {
                        item.onSelect();
                        onDismiss();
                    }}
                >{item.label}</button>
            ))}
            <button type="button" data-testid="ctx-dismiss" onClick={onDismiss}>dismiss</button>
        </div>
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
        fitSignal: 0,
        addNode: vi.fn(),
        deleteNode: vi.fn(),
        updateNode: vi.fn(),
        clearConnections: vi.fn(),
        setDocument: vi.fn(),
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
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        expect(screen.getByTestId('palette')).toBeInTheDocument();
        expect(screen.getByTestId('edit-a')).toBeInTheDocument();
    });

    it('adds a node through the palette', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('palette'));
        expect(controller.addNode).toHaveBeenCalledWith('Upload');
    });

    it('re-runs layout when the re-layout button is clicked', () => {
        const controller = controllerStub();
        const { container } = render(<CanvasPane controller={controller} colorMode="light" />);
        createWrapper(container).findButton('[data-testid="relayout"]')!.click();
        expect(controller.relayout).toHaveBeenCalled();
    });

    it('keeps the modal closed until a node is edited', () => {
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('opens the modal for the double-clicked node', () => {
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        fireEvent.click(screen.getByTestId('edit-a'));
        expect(screen.getByTestId('modal-node').textContent).toBe('a');
    });

    it('saves an edit through the controller and closes the modal', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('edit-a'));
        fireEvent.click(screen.getByTestId('modal-save'));
        expect(controller.updateNode).toHaveBeenCalledWith('a', { name: 'X' });
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('deletes a node through the controller and closes the modal', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('edit-a'));
        fireEvent.click(screen.getByTestId('modal-delete'));
        expect(controller.deleteNode).toHaveBeenCalledWith('a');
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('dismisses the modal without mutating', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('edit-a'));
        fireEvent.click(screen.getByTestId('modal-dismiss'));
        expect(controller.updateNode).not.toHaveBeenCalled();
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    });

    it('shows no context menu until a right-click target is raised', () => {
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
    });

    it('opens a node context menu with edit, delete and clear-connections', () => {
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-node'));
        expect(screen.getByTestId('ctx-item-edit')).toBeInTheDocument();
        expect(screen.getByTestId('ctx-item-delete')).toBeInTheDocument();
        expect(screen.getByTestId('ctx-item-clear')).toBeInTheDocument();
    });

    it('edits a node from its context menu', () => {
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-node'));
        fireEvent.click(screen.getByTestId('ctx-item-edit'));
        expect(screen.getByTestId('modal-node').textContent).toBe('a');
        expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
    });

    it('deletes a node from its context menu', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-node'));
        fireEvent.click(screen.getByTestId('ctx-item-delete'));
        expect(controller.deleteNode).toHaveBeenCalledWith('a');
    });

    it('clears a node\'s connections from its context menu', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-node'));
        fireEvent.click(screen.getByTestId('ctx-item-clear'));
        expect(controller.clearConnections).toHaveBeenCalledWith('a');
    });

    it('deletes a wire from an edge context menu', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-edge'));
        fireEvent.click(screen.getByTestId('ctx-item-delete-edge'));
        expect(controller.deleteEdge).toHaveBeenCalledWith({ source: 'a', target: 'b' });
    });

    it('ignores an edge context-menu delete whose id does not parse', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-edge-bad'));
        fireEvent.click(screen.getByTestId('ctx-item-delete-edge'));
        expect(controller.deleteEdge).not.toHaveBeenCalled();
    });

    it('dismisses the context menu', () => {
        render(<CanvasPane controller={controllerStub()} colorMode="light" />);
        fireEvent.click(screen.getByTestId('ctx-node'));
        fireEvent.click(screen.getByTestId('ctx-dismiss'));
        expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
    });
});





