import { describe, it, expect, vi, beforeEach } from 'vitest';
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
                <button type="button" data-testid="canvas-delete" onClick={() => controller.deleteNode('ingest')}>
                    delete
                </button>
            </div>
        );
    },
}));

// Control import/export at the io-actions boundary so App's Open/Export wiring is
// what is tested, not the browser file dialog.
const importWorkflow = vi.fn();
const exportWorkflow = vi.fn().mockResolvedValue(undefined);
vi.mock('./io/io-actions', () => ({
    importWorkflow: (...args: unknown[]) => importWorkflow(...args),
    exportWorkflow: (...args: unknown[]) => exportWorkflow(...args),
}));

import { App, INITIAL_GRAPH, INITIAL_TEXT } from './App';
import { graphToText } from './app/model-text-sync';

describe('App', () => {
    beforeEach(() => {
        importWorkflow.mockReset();
        importWorkflow.mockResolvedValue({ status: 'cancelled' });
        exportWorkflow.mockReset();
        exportWorkflow.mockResolvedValue(undefined);
    });

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
        const colorButton = () =>
            createWrapper(container).findAllButtons()
                .find((b) => /dark|light/i.test(b.getElement().textContent ?? ''));
        expect(colorButton()?.getElement().textContent).toMatch(/dark/i);
        colorButton()!.click();
        expect(colorButton()?.getElement().textContent).toMatch(/light/i);
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

    it('keeps the seeded text and graph in sync (no drift)', () => {
        expect(INITIAL_TEXT).toBe(graphToText(INITIAL_GRAPH, 'yaml'));
    });

    it('seeds the canvas controller from the initial document', () => {
        render(<App />);
        expect(seenController?.graph.nodes.map((n) => n.id))
            .toEqual(['ingest',
                'verify',
                'settle',
                'inventory',
                'archive']);
    });

    it('re-serializes the editor text when a canvas delete removes a node', async () => {
        const { container } = render(<App />);
        // The default workflow contains an `ingest` step; deleting it drops it from the
        // re-serialized editor text (and its dependents' dependsOn).
        const before = screen.getByTestId('canvas-add'); // ensure canvas mounted
        expect(before).toBeInTheDocument();
        screen.getByTestId('canvas-delete').click();
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        await waitFor(() => {
            const editor = screen.getByLabelText('editor-yaml') as HTMLTextAreaElement;
            expect(editor.value).not.toContain('id: ingest');
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
        // The model holds its last valid state (the seeded default workflow).
        expect(seenController?.graph.nodes.map((n) => n.id)).toEqual(['ingest',
            'verify',
            'settle',
            'inventory',
            'archive']);
    });

    it('exports the current workflow when Export is clicked', () => {
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="export"]')!.click();
        expect(exportWorkflow).toHaveBeenCalled();
    });

    it('applies an imported workflow to the model and editor', async () => {
        importWorkflow.mockResolvedValueOnce({
            status: 'imported',
            graph: { nodes: [{ id: 'imp-1', type: 'Job', with: {}, continueOnError: false }], edges: [] },
            text: 'apiVersion: fme.dev/workflow/v1\nkind: Workflow\nspec:\n  steps: []\n',
            format: 'yaml',
            name: 'imported.yaml',
        });
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="import"]')!.click();
        await waitFor(() => expect(seenController?.graph.nodes.map((n) => n.id)).toEqual(['imp-1']));
    });

    it('shows a flash when an import is invalid', async () => {
        importWorkflow.mockResolvedValueOnce({ status: 'invalid', name: 'bad.yaml' });
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="import"]')!.click();
        await waitFor(() => {
            expect(createWrapper(container).findFlashbar()).not.toBeNull();
        });
        expect(createWrapper(container).findFlashbar()!.findItems()[0].findContent()!.getElement().textContent)
            .toMatch(/bad\.yaml/);
    });

    it('does nothing when an import is cancelled', async () => {
        importWorkflow.mockResolvedValueOnce({ status: 'cancelled' });
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="import"]')!.click();
        // No flash, model unchanged.
        await waitFor(() => expect(importWorkflow).toHaveBeenCalled());
        expect(createWrapper(container).findFlashbar()).toBeNull();
        expect(seenController?.graph.nodes.map((n) => n.id)).toEqual(['ingest',
            'verify',
            'settle',
            'inventory',
            'archive']);
    });

    it('opens the document panel and edits a workflow-level field', async () => {
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="document"]')!.click();
        const name = createWrapper(container).findInput('[data-testid="meta-name"]');
        expect(name).not.toBeNull();
        name!.setInputValue('Renamed workflow');
        // Document edits are canvas-origin, so in split mode the edit re-serializes to
        // the editor text.
        createWrapper(container).findSegmentedControl()!.findSegmentById('split')!.click();
        await waitFor(() => {
            const editor = screen.getByLabelText('editor-yaml') as HTMLTextAreaElement;
            expect(editor.value).toContain('Renamed workflow');
        });
    });

    it('closes the document drawer from its close button', async () => {
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="document"]')!.click();
        await waitFor(() => expect(screen.getByTestId('document-drawer')).toBeInTheDocument());
        fireEvent.click(screen.getByTestId('document-drawer-close'));
        await waitFor(() => expect(screen.queryByTestId('document-drawer')).not.toBeInTheDocument());
    });

    it('dismisses the import-error flash', async () => {
        importWorkflow.mockResolvedValueOnce({ status: 'invalid', name: 'bad.yaml' });
        const { container } = render(<App />);
        createWrapper(container).findButton('[data-testid="import"]')!.click();
        await waitFor(() => expect(createWrapper(container).findFlashbar()).not.toBeNull());
        createWrapper(container).findFlashbar()!.findItems()[0].findDismissButton()!.click();
        await waitFor(() => expect(createWrapper(container).findFlashbar()).toBeNull());
    });
});

