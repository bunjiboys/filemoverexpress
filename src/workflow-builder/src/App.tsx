import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar';
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
import { DocumentDrawer } from './app/document-drawer';
import { useWorkflowGraph } from './canvas/use-workflow-graph';
import { graphToText, textToGraph } from './app/model-text-sync';
import { browserFileAccess, type OpenedFile } from './io/file-access';
import { importWorkflow, exportWorkflow } from './io/io-actions';
import { useFileDrop } from './io/use-file-drop';
import { type WorkflowGraph } from './workflow/graph';

// The default workflow the page opens with: a realistic nightly media-ingest pipeline
// shaped as a fork/join diamond (ingest -> verify -> {settle, inventory} -> archive)
// with parameters, defaults and metadata, so the canvas and editor open with something
// substantial to explore. The literal graph and its serialized text are the SAME
// document in two forms, kept adjacent so they cannot drift (and so there is no
// unreachable parse-failure branch at module load). It is schema- and structure-valid.
export const INITIAL_GRAPH: WorkflowGraph = {
    metadata: {
        name: 'Nightly media ingest and archive',
        description: 'Download camera media, verify it, inventory it, then archive to cold storage.',
        labels: { team: 'post-production', tier: 'nightly' },
    },
    parameters: [
        { name: 'ingestProfile', type: 'transfer_profile', required: true, default: 'capture-ingest' },
        { name: 'egressProfile', type: 'transfer_profile', required: true, default: 'cold-archive' },
        { name: 'archivePrefix', type: 'string', required: false, default: 'archive/' },
    ],
    defaults: { force: false },
    nodes: [
        {
            id: 'ingest',
            type: 'Download',
            name: 'Ingest from capture bucket',
            continueOnError: false,
            with: {
                transferProfile: '${params.ingestProfile}',
                sources: ['incoming/'],
                destination: '/mnt/ingest',
            },
        },
        {
            id: 'verify',
            type: 'Checksum',
            name: 'Verify + write MHL',
            continueOnError: false,
            with: {
                sources: ['/mnt/ingest'],
                algorithm: 'xxh3',
                recursive: true,
                writeMhl: true,
                mhlOutput: '/mnt/ingest/ingest.mhl',
                failOnMismatch: true,
            },
        },
        {
            id: 'settle',
            type: 'Sleep',
            name: 'Settle before archive',
            continueOnError: false,
            with: { duration: '30s' },
        },
        {
            id: 'inventory',
            type: 'InventoryReport',
            name: 'Inventory capture bucket',
            continueOnError: false,
            with: {
                transferProfile: '${params.ingestProfile}',
                outputFormat: 'csv',
                pretty: true,
                includeChecksums: true,
            },
        },
        {
            id: 'archive',
            type: 'Upload',
            name: 'Archive to cold storage',
            continueOnError: false,
            with: {
                transferProfile: '${params.egressProfile}',
                sources: ['/mnt/ingest'],
                destination: 'archive/cold',
                uploadBasePath: '${params.archivePrefix}',
            },
        },
    ],
    edges: [
        { source: 'ingest', target: 'verify' },
        { source: 'verify', target: 'settle' },
        { source: 'verify', target: 'inventory' },
        { source: 'settle', target: 'archive' },
        { source: 'inventory', target: 'archive' },
    ],
};

// The canonical text form of the default graph, derived from it so the two can never
// drift (the drift guard in App.test asserts this derivation).
export const INITIAL_TEXT = graphToText(INITIAL_GRAPH, 'yaml');

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
    // Whether the document panel (metadata/parameters/defaults) tools drawer is open.
    const [docOpen, setDocOpen] = useState(false);
    // Which view produced the pending model/text change, so each sync direction only
    // reacts to the OTHER view's edits and the loop terminates.
    const lastEdit = useRef<'canvas' | 'editor'>('canvas');

    // A document-panel edit is a model change that should flow back out to the editor
    // text, so it is marked canvas-origin like the other canvas mutations.
    const onDocumentChange = useCallback((patch: Parameters<typeof controller.setDocument>[0]) => {
        lastEdit.current = 'canvas';
        controller.setDocument(patch);
    }, [controller]);

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

    // Import/export (docs sections 6, 9). A flash reports a bad import; a successful
    // import replaces the model and seeds both views from the imported text.
    const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

    const applyImport = useCallback((file?: OpenedFile) => {
        void importWorkflow(browserFileAccess, file).then((result) => {
            if (result.status === 'cancelled') {
                return;
            }
            if (result.status === 'invalid') {
                setFlash([{
                    type: 'error',
                    header: 'Could not import file',
                    content: `${result.name} is not a valid workflow document.`,
                    dismissible: true,
                    onDismiss: () => setFlash([]),
                    id: 'import-error',
                }]);
                return;
            }
            // Treat an import as an editor-origin change so the canvas->editor sync does
            // not immediately re-serialize over the imported text.
            lastEdit.current = 'editor';
            controller.setGraph(result.graph);
            setText(result.text);
            setFormat(result.format);
            setFlash([]);
        });
    }, [controller]);

    const onImport = useCallback(() => applyImport(), [applyImport]);
    const onExport = useCallback(() => {
        void exportWorkflow(browserFileAccess, controller.graph, format);
    }, [controller, format]);

    // Drop a workflow file anywhere on the window to import it.
    useFileDrop(applyImport);

    // The two pane elements, built once and placed either side-by-side (resizable in
    // split mode) or alone (single-pane modes).
    const canvasPane = <CanvasPane controller={canvasController} colorMode={color.mode} />;
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
        <>
            <AppLayout
                navigationHide
                toolsHide
                content={
                    <ContentLayout
                        header={
                            <Header
                                variant="h1"
                                actions={
                                    <SpaceBetween direction="horizontal" size="xs">
                                        <Button data-testid="import" iconName="upload" onClick={onImport}>Open</Button>
                                        <Button data-testid="export" iconName="download" onClick={onExport}>Export</Button>
                                        <Button data-testid="document" variant="primary" iconName="settings" onClick={() => setDocOpen((o) => !o)}>Document</Button>
                                        <ViewModeControl mode={view.mode} onChange={view.setMode} />
                                        <ColorModeToggle mode={color.mode} onToggle={color.toggle} />
                                    </SpaceBetween>
                                }
                            >
                                FME Workflow Builder
                            </Header>
                        }
                    >
                        <SpaceBetween size="s">
                            {flash.length > 0 && <Flashbar items={flash} />}
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
                        </SpaceBetween>
                    </ContentLayout>
                }
            />
            <DocumentDrawer
                open={docOpen}
                graph={controller.graph}
                colorMode={color.mode}
                onChange={onDocumentChange}
                onClose={() => setDocOpen(false)}
            />
        </>
    );
}
