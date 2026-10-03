import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import type { WorkflowGraphController } from './use-workflow-graph';

// The pane composes the palette, the canvas and a layout toolbar; mock the two heavy
// children (palette already unit-tested; canvas wraps un-renderable React Flow) and
// ReactFlowProvider at the module boundary so the pane's own composition and the
// toolbar wiring are what this test exercises.
vi.mock('./node-palette', () => ({
    NodePalette: ({ onAdd }: { onAdd: (t: string) => void }) => (
        <button type="button" data-testid="palette" onClick={() => onAdd('Job')}>palette</button>
    ),
}));
vi.mock('./workflow-canvas', () => ({
    WorkflowCanvas: () => <div data-testid="canvas" />,
}));
vi.mock('@xyflow/react', () => ({
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CanvasPane } from './canvas-pane';

function controllerStub(overrides: Partial<WorkflowGraphController> = {}): WorkflowGraphController {
    return {
        graph: { nodes: [], edges: [] },
        positions: [],
        addNode: vi.fn(),
        deleteNode: vi.fn(),
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
        expect(screen.getByTestId('canvas')).toBeInTheDocument();
    });

    it('adds a node through the palette', () => {
        const controller = controllerStub();
        render(<CanvasPane controller={controller} />);
        screen.getByTestId('palette').click();
        expect(controller.addNode).toHaveBeenCalledWith('Job');
    });

    it('re-runs layout when the re-layout button is clicked', () => {
        const controller = controllerStub();
        const { container } = render(<CanvasPane controller={controller} />);
        createWrapper(container).findButton('[data-testid="relayout"]')!.click();
        expect(controller.relayout).toHaveBeenCalled();
    });
});
