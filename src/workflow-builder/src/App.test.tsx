import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';

// The editor pane mounts the Ace-based CodeEditor, which does not render in jsdom;
// mock it at its module boundary (docs section 13) so App renders in unit tests.
vi.mock('./editor/lazy-code-editor', () => ({
    LazyCodeEditor: ({ value, language }: { value: string; language: string }) => (
        <textarea aria-label={`editor-${language}`} value={value} readOnly />
    ),
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
        // Enter editor mode (first segmented control is the view-mode switch).
        createWrapper(container).findSegmentedControl()!.findSegmentById('editor')!.click();
        // The editor shows YAML initially.
        expect(screen.getByLabelText('editor-yaml')).toBeInTheDocument();
        // The format toggle is the second segmented control; switch it to JSON.
        const controls = createWrapper(container).findAllSegmentedControls();
        controls[controls.length - 1].findSegmentById('json')!.click();
        // The editor now shows JSON, and the content is valid JSON (converted, not raw YAML).
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
});
