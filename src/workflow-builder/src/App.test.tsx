import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
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

    it('offers a color-mode toggle that flips its label when clicked', () => {
        const { container } = render(<App />);
        const button = createWrapper(container).findButton();
        expect(button?.getElement().textContent).toMatch(/dark/i);
        button!.click();
        expect(createWrapper(container).findButton()?.getElement().textContent).toMatch(/light/i);
    });
});
