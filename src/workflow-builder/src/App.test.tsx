import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import type { WorkflowGraphController } from './canvas/use-workflow-graph';

// The editor pane mounts the Ace-based CodeEditor, which does not render in jsdom;
// mock it at its module boundary (docs section 13) so App renders in unit tests.
vi.mock('./editor/lazy-code-editor', () => ({
    LazyCodeEditor: ({ value, language, onChange }: {
        value: string;
        language: string;
        onChange: (v: string) => void;
    }) => (
        <textarea
            aria-label={`editor-${language}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

// CanvasPane wraps React Flow (un-renderable in jsdom) and is unit-tested on its own;
// mock it here and expose the controller it is handed, plus an add-a-Job trigger, so
// App's composition and the canvas->editor sync are what this test exercises.
let seenController: WorkflowGraphController | undefined;
vi.mock('./canvas/canvas-pane', () => ({
    CanvasPane: ({ controller }: { controller: WorkflowGraphController }) => {
        seenController = controller;
        return (
            <div>
                <button type="button" data-testid="canvas-add" onClick={() => controller.addNode('Job')}>
                    add
                </button>
                <button type="button" data-testid="canvas-delete" onClick={() => controller.deleteNode('step-1')}>
                    delete
                </button>
            </div>
        );
    },
}));

import { App } from './App';

describe('App', () => {
    it('renders the Cloudscape app layout', () => {
        const { container } = render(<App />);
        expect(createWrapper(container).findAppLayout()).not.toBeNull();
    });

    it('shows the canvas region by default (visual mode)', () => {
        render(<App />);
        expect(screen.getByTestId('canvas-pane')).toBeInTheDocument();
        expect(screen.queryByTestId('editor-pane')).not.toBeInTheDocument();
    });

    it('switches to editor mode, hiding the canvas and showing the editor', () => {
        const { container } = render(<App />);
        createWrapper(container).findSegmentedControl()!.findSegmentById('editor')!.click();
        expect(screen.queryByTestId('canvas-pane')).not.toBeInTheDocument();
        expect(screen.getByTestId('editor-pane')).toBeInTheDocument();
    });

    it('shows both panes in split mode', () => {
        const { container } = render(<App />);
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        expect(screen.getByTestId('canvas-pane')).toBeInTheDocument();
        expect(screen.getByTestId('editor-pane')).toBeInTheDocument();
    });

    it('converts the document content when switching YAML to JSON', () => {
        const { container } = render(<App />);
        createWrapper(container).findSegmentedControl()!.findSegmentById('editor')!.click();
        expect(screen.getByLabelText('editor-yaml')).toBeInTheDocument();
        const controls = createWrapper(container).findAllSegmentedControls();
        controls[controls.length - 1].findSegmentById('json')!.click();
        const jsonEditor = screen.getByLabelText('editor-json') as HTMLTextAreaElement;
        expect(jsonEditor).toBeInTheDocument();
        expect(() => JSON.parse(jsonEditor.value)).not.toThrow();
    });

    it('offers a color-mode toggle that flips its label when clicked', () => {
        const { container } = render(<App />);
        const button = createWrapper(container).findButton();
        expect(button?.getElement().textContent).toMatch(/dark/i);
        button!.click();
        expect(createWrapper(container).findButton()?.getElement().textContent).toMatch(/light/i);
    });

    it('re-serializes the editor text when the canvas model changes', async () => {
        const { container } = render(<App />);
        // Add a node on the (mocked) canvas, then open the editor in split mode.
        screen.getByTestId('canvas-add').click();
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        // The derived editor text now carries the new Job step.
        await waitFor(() => {
            const editor = screen.getByLabelText('editor-yaml') as HTMLTextAreaElement;
            expect(editor.value).toContain('type: Job');
        });
    });

    it('seeds the canvas controller from the initial document', () => {
        render(<App />);
        expect(seenController?.graph.nodes.map((n) => n.type)).toEqual(['Sleep']);
    });

    it('re-serializes the editor text when a canvas delete empties the graph', async () => {
        const { container } = render(<App />);
        screen.getByTestId('canvas-delete').click();
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        await waitFor(() => {
            const editor = screen.getByLabelText('editor-yaml') as HTMLTextAreaElement;
            expect(editor.value).not.toContain('type: Sleep');
        });
    });

    it('updates the model when the editor text is edited to a valid document', async () => {
        const { container } = render(<App />);
        // Split mode keeps the canvas mounted so the controller it receives stays current.
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        const editor = screen.getByLabelText('editor-yaml') as HTMLTextAreaElement;
        const next = [
            'apiVersion: fme.dev/workflow/v1',
            'kind: Workflow',
            'spec:',
            '  steps:',
            '    - id: step-9',
            '      type: Checksum',
            '      with: { sources: [a], algorithm: md5 }',
            '',
        ].join('\n');
        fireEvent.change(editor, { target: { value: next } });
        await waitFor(() => expect(seenController?.graph.nodes.map((n) => n.id)).toEqual(['step-9']));
    });

    it('leaves the model unchanged while the editor text is mid-edit and invalid', () => {
        const { container } = render(<App />);
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        const editor = screen.getByLabelText('editor-yaml') as HTMLTextAreaElement;
        fireEvent.change(editor, { target: { value: 'kind: : : not valid : :' } });
        // The model holds its last valid state (the seeded Sleep step).
        expect(seenController?.graph.nodes.map((n) => n.type)).toEqual(['Sleep']);
    });
});
