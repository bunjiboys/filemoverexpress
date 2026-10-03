import { useCallback, useMemo, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useViewMode } from './app/use-view-mode';
import { ViewModeControl } from './app/view-mode-control';
import { useColorMode } from './app/use-color-mode';
import { ColorModeToggle } from './app/color-mode-toggle';
import { EditorPane } from './editor/editor-pane';
import { validateText } from './editor/validate-text';
import { convertText } from './editor/convert-text';
import { type EditorFormat } from './editor/editor-text';
import { API_VERSION, KIND } from './workflow/graph';

// A minimal starting document so the editor opens with something valid to edit.
const INITIAL_TEXT = [
    `apiVersion: ${API_VERSION}`,
    `kind: ${KIND}`,
    'spec:',
    '  steps:',
    '    - id: step-1',
    '      type: Sleep',
    '      with:',
    '        duration: 30s',
    '',
].join('\n');

// Thin composition root (docs section 13): it owns the view-mode, color-mode, and
// editor document state and lays out the Cloudscape shell. Parsing, validation and
// layout live in their own modules; App only wires them together. The canvas pane is
// still a placeholder until step 9.
export function App(): React.JSX.Element {
    const view = useViewMode();
    const color = useColorMode();
    const [text, setText] = useState(INITIAL_TEXT);
    const [format, setFormat] = useState<EditorFormat>('yaml');

    // Schema + graph validation of the current text, surfaced as editor annotations.
    const annotations = useMemo(() => validateText(text, format), [text, format]);

    // Switching the YAML/JSON toggle converts the current content to the new format
    // (parse-then-reserialize) so the document moves with the format instead of being
    // reinterpreted as the new syntax, which would raise spurious validation errors.
    const changeFormat = useCallback((next: EditorFormat) => {
        setText((current) => convertText(current, format, next));
        setFormat(next);
    }, [format]);

    return (
        <AppLayout
            toolsHide
            navigationHide
            content={
                <ContentLayout
                    header={
                        <Header
                            variant="h1"
                            actions={
                                <SpaceBetween direction="horizontal" size="xs">
                                    <ViewModeControl mode={view.mode} onChange={view.setMode} />
                                    <ColorModeToggle mode={color.mode} onToggle={color.toggle} />
                                </SpaceBetween>
                            }
                        >
                            FME Workflow Builder
                        </Header>
                    }
                >
                    <div style={{ display: 'flex', gap: 16 }}>
                        {view.showCanvas && (
                            <div data-testid="canvas-pane">Canvas</div>
                        )}
                        {view.showEditor && (
                            <div data-testid="editor-pane" style={{ flex: 1 }}>
                                <EditorPane
                                    text={text}
                                    format={format}
                                    annotations={annotations}
                                    colorMode={color.mode}
                                    onChangeText={setText}
                                    onChangeFormat={changeFormat}
                                />
                            </div>
                        )}
                    </div>
                </ContentLayout>
            }
        />
    );
}
