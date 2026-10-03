import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import createWrapper from '@cloudscape-design/components/test-utils/dom';
import type { Annotation } from './lazy-code-editor';

// The LazyCodeEditor wraps Cloudscape CodeEditor + Ace, which does not load in jsdom,
// so mock it at its module boundary with a plain textarea exposing the same
// value/language/annotations/onChange contract (docs section 13). Real editor
// behavior is Tier-2 Playwright's job.
vi.mock('./lazy-code-editor', () => ({
    LazyCodeEditor: ({ value, language, annotations, onChange }: {
        value: string;
        language: string;
        annotations: Annotation[];
        onChange: (v: string) => void;
    }) => (
        <textarea
            aria-label={`editor-${language}`}
            data-annotations={annotations.length}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

import { EditorPane } from './editor-pane';

describe('EditorPane', () => {
    it('renders the text in a YAML editor by default', () => {
        render(<EditorPane text="apiVersion: x" format="yaml" annotations={[]} colorMode="light" onChangeText={vi.fn()} onChangeFormat={vi.fn()} />);
        expect(screen.getByLabelText('editor-yaml')).toHaveValue('apiVersion: x');
    });

    it('uses the json language when format is json', () => {
        render(<EditorPane text="{}" format="json" annotations={[]} colorMode="light" onChangeText={vi.fn()} onChangeFormat={vi.fn()} />);
        expect(screen.getByLabelText('editor-json')).toBeInTheDocument();
    });

    it('fires onChangeText when the editor content changes', () => {
        const onChangeText = vi.fn();
        render(<EditorPane text="" format="yaml" annotations={[]} colorMode="light" onChangeText={onChangeText} onChangeFormat={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('editor-yaml'), { target: { value: 'kind: Workflow' } });
        expect(onChangeText).toHaveBeenCalledWith('kind: Workflow');
    });

    it('passes validation annotations through to the editor', () => {
        const annotations: Annotation[] = [{ row: 0, column: 0, text: 'bad', type: 'error' }];
        render(<EditorPane text="{}" format="json" annotations={annotations} colorMode="light" onChangeText={vi.fn()} onChangeFormat={vi.fn()} />);
        expect(screen.getByLabelText('editor-json')).toHaveAttribute('data-annotations', '1');
    });

    it('offers a YAML/JSON format toggle and fires onChangeFormat on switch', () => {
        const onChangeFormat = vi.fn();
        const { container } = render(
            <EditorPane text="{}" format="yaml" annotations={[]} colorMode="light" onChangeText={vi.fn()} onChangeFormat={onChangeFormat} />,
        );
        createWrapper(container).findSegmentedControl()!.findSegmentById('json')!.click();
        expect(onChangeFormat).toHaveBeenCalledWith('json');
    });
});
