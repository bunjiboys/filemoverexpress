import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CanvasPane } from './canvas/canvas-pane';
import { SplitLayout } from './app/split-layout';
import { useWorkflowGraph } from './canvas/use-workflow-graph';
import { graphToText, textToGraph } from './app/model-text-sync';
import { API_VERSION, KIND, type WorkflowGraph } from './workflow/graph';

// A minimal starting document so both views open with something valid. The literal
// graph and its serialized text are the SAME document in two forms, kept adjacent so
// they cannot drift; building the graph as a literal (rather than parsing the text)
// avoids an unreachable parse-failure branch at module load.
const INITIAL_GRAPH: WorkflowGraph = {
    nodes: [{ id: 'step-1', type: 'Sleep', with: { duration: '30s' }, continueOnError: false }],
    edges: [],
};

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

// Thin composition root (docs section 13): it owns the single-source-of-truth graph
// (via useWorkflowGraph), the editor document text, and the view/color modes, and
// lays out the Cloudscape shell. The canvas and editor are both projections of the
// one graph model (docs section 10): a canvas edit re-serializes to editor text, and
// an editor edit that parses+validates updates the model (which the canvas re-renders
// from). An origin ref breaks the sync loop so a keystroke is not clobbered by its own
// re-serialization.
export function App(): React.JSX.Element {
    const view = useViewMode();
    const color = useColorMode();
    const controller = useWorkflowGraph(INITIAL_GRAPH);
    const [text, setText] = useState(INITIAL_TEXT);
    const [format, setFormat] = useState<EditorFormat>('yaml');
    // Split-view divider ratio (left-pane fraction). Lifted here so it survives a view
    // switch within the session; default is a 60/40 canvas/editor split. Not persisted.
    const [splitRatio, setSplitRatio] = useState(0.6);
    // Which view produced the pending model/text change, so each sync direction only
    // reacts to the OTHER view's edits and the loop terminates.
    const lastEdit = useRef<'canvas' | 'editor'>('canvas');

    // Canvas -> editor: when the model changes from a canvas edit, re-derive the
    // canonical editor text. Skipped for editor-origin changes so the user's in-flight
    // text (and cursor) is not overwritten by its own round-trip.
    useEffect(() => {
        if (lastEdit.current === 'editor') {
            return;
        }
        setText(graphToText(controller.graph, format));
    }, [controller.graph, format]);

    // Editor -> canvas: hold the typed text locally and, when it parses+validates,
    // push the new model into the controller. A mid-edit that does not validate leaves
    // the model as-is; the editor still shows the per-error annotations below.
    const onChangeText = useCallback((next: string) => {
        lastEdit.current = 'editor';
        setText(next);
        const graph = textToGraph(next, format);
        if (graph !== undefined) {
            controller.setGraph(graph);
        }
    }, [controller, format]);

    // Any node add/delete on the canvas marks the next model change as canvas-origin
    // so it flows back out to the editor text; the rest pass through unchanged.
    const canvasController = useMemo(() => ({
        ...controller,
        addNode: (type: string) => {
            lastEdit.current = 'canvas';
            controller.addNode(type);
        },
        deleteNode: (id: string) => {
            lastEdit.current = 'canvas';
            controller.deleteNode(id);
        },
    }), [controller]);

    // Schema + graph validation of the current text, surfaced as editor annotations.
    const annotations = useMemo(() => validateText(text, format), [text, format]);

    // Switching the YAML/JSON toggle converts the current content to the new format
    // (parse-then-reserialize) so the document moves with the format instead of being
    // reinterpreted as the new syntax, which would raise spurious validation errors.
    const changeFormat = useCallback((next: EditorFormat) => {
        lastEdit.current = 'editor';
        setText((current) => convertText(current, format, next));
        setFormat(next);
    }, [format]);

    // The two pane elements, built once and placed either side-by-side (resizable in
    // split mode) or alone (single-pane modes).
    const canvasPane = <CanvasPane controller={canvasController} />;
    const editorPane = (
        <EditorPane
            text={text}
            format={format}
            annotations={annotations}
            colorMode={color.mode}
            onChangeText={onChangeText}
            onChangeFormat={changeFormat}
        />
    );

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
                    <div style={{ display: 'flex', gap: 16, height: '78vh' }}>
                        {view.mode === 'split' ? (
                            <SplitLayout
                                ratio={splitRatio}
                                onRatioChange={setSplitRatio}
                                left={<div data-testid="canvas-pane" style={{ height: '100%' }}>{canvasPane}</div>}
                                right={<div data-testid="editor-pane" style={{ height: '100%' }}>{editorPane}</div>}
                            />
                        ) : (
                            <>
                                {view.showCanvas && (
                                    <div data-testid="canvas-pane" style={{ flex: 1 }}>{canvasPane}</div>
                                )}
                                {view.showEditor && (
                                    <div data-testid="editor-pane" style={{ flex: 1 }}>{editorPane}</div>
                                )}
                            </>
                        )}
                    </div>
                </ContentLayout>
            }
        />
    );
}
