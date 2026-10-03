import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import type { WorkflowGraphController } from './use-workflow-graph';

// React Flow does not render in jsdom, so mock it at the module boundary (docs
// section 13). The mock captures the props the canvas passes (nodes/edges counts and
// the callbacks) onto the DOM so the test can assert the wiring and invoke the
// callbacks, standing in for the real gestures that Tier-2 Playwright drives.
const captured: {
    onNodesChange?: (c: NodeChange[]) => void;
    onEdgesChange?: (c: EdgeChange[]) => void;
    onConnect?: (c: Connection) => void;
    isValidConnection?: (c: Connection) => boolean;
    onNodeDoubleClick?: (e: unknown, node: { id: string }) => void;
} = {};

vi.mock('@xyflow/react', () => ({
    ReactFlow: (props: {
        nodes: unknown[];
        edges: unknown[];
        onNodesChange: (c: NodeChange[]) => void;
        onEdgesChange: (c: EdgeChange[]) => void;
        onConnect: (c: Connection) => void;
        isValidConnection: (c: Connection) => boolean;
        onNodeDoubleClick: (e: unknown, node: { id: string }) => void;
        children?: React.ReactNode;
    }) => {
        captured.onNodesChange = props.onNodesChange;
        captured.onEdgesChange = props.onEdgesChange;
        captured.onConnect = props.onConnect;
        captured.isValidConnection = props.isValidConnection;
        captured.onNodeDoubleClick = props.onNodeDoubleClick;
        return (
            <div
                data-testid="react-flow"
                data-node-count={props.nodes.length}
                data-edge-count={props.edges.length}
            >
                {props.children}
            </div>
        );
    },
    Background: () => <div data-testid="rf-background" />,
    Controls: () => <div data-testid="rf-controls" />,
    MiniMap: () => <div data-testid="rf-minimap" />,
    Handle: () => <div />,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    applyNodeChanges: (_changes: NodeChange[], nodes: unknown[]) => nodes,
}));

import { WorkflowCanvas } from './workflow-canvas';

function controllerStub(overrides: Partial<WorkflowGraphController> = {}): WorkflowGraphController {
    return {
        graph: {
            nodes: [
                { id: 'a', type: 'Sleep', with: {}, continueOnError: false }, { id: 'b', type: 'Job', with: {}, continueOnError: false },
            ],
            edges: [{ source: 'a', target: 'b' }],
        },
        positions: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
        addNode: vi.fn(),
        deleteNode: vi.fn(),
        updateNode: vi.fn(),
        connect: vi.fn(),
        deleteEdge: vi.fn(),
        moveNode: vi.fn(),
        isValidConnection: vi.fn().mockReturnValue(true),
        relayout: vi.fn(),
        setGraph: vi.fn(),
        ...overrides,
    };
}

describe('WorkflowCanvas', () => {
    it('projects the controller graph into React Flow nodes and edges', () => {
        render(<WorkflowCanvas controller={controllerStub()} onEditNode={vi.fn()} />);
        const rf = screen.getByTestId('react-flow');
        expect(rf).toHaveAttribute('data-node-count', '2');
        expect(rf).toHaveAttribute('data-edge-count', '1');
    });

    it('renders the background, controls and minimap chrome', () => {
        render(<WorkflowCanvas controller={controllerStub()} onEditNode={vi.fn()} />);
        expect(screen.getByTestId('rf-background')).toBeInTheDocument();
        expect(screen.getByTestId('rf-controls')).toBeInTheDocument();
        expect(screen.getByTestId('rf-minimap')).toBeInTheDocument();
    });

    it('routes node position changes to the controller', () => {
        const controller = controllerStub();
        render(<WorkflowCanvas controller={controller} onEditNode={vi.fn()} />);
        captured.onNodesChange!([{ id: 'a', type: 'position', position: { x: 9, y: 9 } }]);
        expect(controller.moveNode).toHaveBeenCalledWith('a', { x: 9, y: 9 });
    });

    it('routes edge removals to the controller', () => {
        const controller = controllerStub();
        render(<WorkflowCanvas controller={controller} onEditNode={vi.fn()} />);
        captured.onEdgesChange!([{ id: 'a->b', type: 'remove' }]);
        expect(controller.deleteEdge).toHaveBeenCalledWith({ source: 'a', target: 'b' });
    });

    it('routes a connection to the controller', () => {
        const controller = controllerStub();
        render(<WorkflowCanvas controller={controller} onEditNode={vi.fn()} />);
        captured.onConnect!({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null });
        expect(controller.connect).toHaveBeenCalledWith({ source: 'a', target: 'b' });
    });

    it('delegates connection validity to the controller', () => {
        const controller = controllerStub();
        render(<WorkflowCanvas controller={controller} onEditNode={vi.fn()} />);
        captured.isValidConnection!({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null });
        expect(controller.isValidConnection).toHaveBeenCalledWith({ source: 'a', target: 'b' });
    });

    it('ignores a connection missing an endpoint', () => {
        const controller = controllerStub();
        render(<WorkflowCanvas controller={controller} onEditNode={vi.fn()} />);
        captured.onConnect!({ source: null, target: 'b', sourceHandle: null, targetHandle: null } as never);
        captured.isValidConnection!({ source: 'a', target: null, sourceHandle: null, targetHandle: null } as never);
        expect(controller.connect).not.toHaveBeenCalled();
        expect(controller.isValidConnection).not.toHaveBeenCalled();
    });

    it('opens the editor for a double-clicked node', () => {
        const onEditNode = vi.fn();
        render(<WorkflowCanvas controller={controllerStub()} onEditNode={onEditNode} />);
        captured.onNodeDoubleClick!({}, { id: 'a' });
        expect(onEditNode).toHaveBeenCalledWith('a');
    });
});

