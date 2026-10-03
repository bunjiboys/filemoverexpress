import SegmentedControl from '@cloudscape-design/components/segmented-control';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { LazyCodeEditor, type Annotation } from './lazy-code-editor';
import type { EditorFormat } from './editor-text';

export interface EditorPaneProps {
    text: string;
    format: EditorFormat;
    annotations: Annotation[];
    colorMode: 'light' | 'dark';
    onChangeText: (text: string) => void;
    onChangeFormat: (format: EditorFormat) => void;
}

// The Editor-mode pane (docs section 10): a YAML/JSON format toggle over the
// Cloudscape CodeEditor. Controlled - it renders the given text in the given format,
// surfaces the given validation annotations (computed by the schema layer, since the
// editor does no schema validation itself), and reports edits and format switches to
// the parent, which owns the document model.
export function EditorPane({
    text,
    format,
    annotations,
    colorMode,
    onChangeText,
    onChangeFormat,
}: EditorPaneProps): React.JSX.Element {
    return (
        <SpaceBetween size="xs">
            <SegmentedControl
                selectedId={format}
                onChange={(e) => onChangeFormat(e.detail.selectedId as EditorFormat)}
                label="Document format"
                options={[
                    { id: 'yaml', text: 'YAML' }, { id: 'json', text: 'JSON' },
                ]}
            />
            <LazyCodeEditor
                value={text}
                language={format}
                annotations={annotations}
                colorMode={colorMode}
                onChange={onChangeText}
            />
        </SpaceBetween>
    );
}
