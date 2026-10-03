import { useEffect, useRef, useState } from 'react';
import CodeEditor, { type CodeEditorProps } from '@cloudscape-design/components/code-editor';
import type { EditorFormat } from './editor-text';

export interface Annotation {
    row: number;
    column?: number;
    text: string;
    type: 'error' | 'warning' | 'info';
}

export interface CodeEditorPaneProps {
    value: string;
    language: EditorFormat;
    annotations: Annotation[];
    colorMode: 'light' | 'dark';
    onChange: (value: string) => void;
}

// Minimal i18n strings CodeEditor requires. English-only is acceptable for v1.
const I18N: CodeEditorProps.I18nStrings = {
    loadingState: 'Loading code editor',
    errorState: 'There was an error loading the code editor.',
    errorStateRecovery: 'Retry',
    editorGroupAriaLabel: 'Code editor',
    statusBarGroupAriaLabel: 'Status bar',
    cursorPosition: (row, column) => `Ln ${row}, Col ${column}`,
    errorsTab: 'Errors',
    warningsTab: 'Warnings',
    preferencesButtonAriaLabel: 'Preferences',
    paneCloseButtonAriaLabel: 'Close',
    preferencesModalHeader: 'Preferences',
    preferencesModalCancel: 'Cancel',
    preferencesModalConfirm: 'Confirm',
    preferencesModalWrapLines: 'Wrap lines',
    preferencesModalTheme: 'Theme',
    preferencesModalLightThemes: 'Light themes',
    preferencesModalDarkThemes: 'Dark themes',
};

const THEMES: CodeEditorProps.AvailableThemes = {
    light: ['cloud_editor'],
    dark: ['cloud_editor_dark'],
};

// Lazy-loaded CloudScape CodeEditor wrapper. Ace loads its syntax/theme assets at
// runtime, so `ace-builds` (plus the yaml/json modes and the Cloudscape themes) is
// dynamically imported only when this pane first mounts, and handed to CodeEditor via
// its `ace` prop. CodeEditor has NO built-in JSON Schema validation; schema problems
// arrive as `annotations` computed by our own validation layer (see editor-pane).
//
// This file is Ace/DOM glue: ace-builds does not load in jsdom, so it is mocked at
// this module boundary in tests and excluded from the coverage gate (vitest.config).
// Real editor behavior is covered by Tier-2 Playwright.
export function LazyCodeEditor({ value, language, annotations, colorMode, onChange }: CodeEditorPaneProps): React.JSX.Element {
    const [ace, setAce] = useState<CodeEditorProps['ace']>();
    const [loading, setLoading] = useState(true);
    const [preferences, setPreferences] = useState<CodeEditorProps.Preferences | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const annotationsRef = useRef<Annotation[]>(annotations);
    annotationsRef.current = annotations;

    // CodeEditor defaults its preferences theme to the light 'dawn' theme when
    // preferences is undefined, which looks white against a dark app. Default the
    // theme to match the app's color mode; once the user picks a theme in the
    // preferences modal, their choice (in `preferences`) takes over.
    const effectivePreferences: CodeEditorProps.Preferences = preferences ?? {
        wrapLines: true,
        theme: colorMode === 'dark' ? 'cloud_editor_dark' : 'cloud_editor',
    };

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const aceModule = await import('ace-builds');
            // The CSS styles the themes, but Ace also needs the theme and mode MODULES
            // loaded to register them by name - without the module, setTheme falls back
            // to a light default (which showed as a white editor in dark mode).
            await import('ace-builds/css/ace.css');
            await import('ace-builds/css/theme/cloud_editor.css');
            await import('ace-builds/css/theme/cloud_editor_dark.css');
            await import('ace-builds/src-noconflict/theme-cloud_editor');
            await import('ace-builds/src-noconflict/theme-cloud_editor_dark');
            await import('ace-builds/src-noconflict/mode-yaml');
            await import('ace-builds/src-noconflict/mode-json');
            aceModule.config.set('useStrictCSP', true);
            if (!cancelled) {
                setAce(aceModule);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // CodeEditor has no `annotations` input prop: Ace reads its own and emits them via
    // onValidate, and does not accept externally-injected ones through React. To show
    // OUR schema annotations we reach the underlying Ace editor and set them on its
    // session. ace.edit(node) returns the editor Cloudscape already created for that
    // node. Ace's own syntax worker calls setAnnotations and would clear ours, so we
    // re-apply on the session's changeAnnotation event, merging ours back in.
    useEffect(() => {
        if (ace === undefined || loading || containerRef.current === null) {
            return undefined;
        }
        const node = containerRef.current.querySelector<HTMLElement>('.ace_editor');
        if (node === null) {
            return undefined;
        }
        const editor = (ace as { edit: (el: HTMLElement) => AceEditorLike }).edit(node);
        const session = editor.getSession();

        let applying = false;
        const apply = (): void => {
            if (applying) {
                return;
            }
            applying = true;
            const own = annotationsRef.current;
            // Keep Ace's own syntax annotations and add ours on top.
            const existing = session.getAnnotations().filter((a) => !a.text.startsWith(SCHEMA_PREFIX));
            session.setAnnotations([...existing, ...own.map((a) => ({ ...a, text: `${SCHEMA_PREFIX}${a.text}` }))]);
            applying = false;
        };

        apply();
        session.on('changeAnnotation', apply);
        return () => {
            session.off('changeAnnotation', apply);
        };
    }, [ace,
        loading,
        annotations]);

    return (
        <div ref={containerRef}>
            <CodeEditor
                ace={ace}
                value={value}
                language={language}
                loading={loading}
                editorContentHeight={400}
                onEditorContentResize={() => undefined}
                onDelayedChange={(e) => onChange(e.detail.value)}
                preferences={effectivePreferences}
                onPreferencesChange={(e) => setPreferences(e.detail)}
                i18nStrings={I18N}
                themes={THEMES}
            />
        </div>
    );
}

// Zero-width-space marker prefixed to our annotations so they can be told apart from
// Ace's own syntax annotations when re-applying after Ace's worker clears the session.
const SCHEMA_PREFIX = '\u200b';

interface AceEditorLike {
    getSession: () => AceSessionLike;
}

interface AceSessionLike {
    getAnnotations: () => Annotation[];
    setAnnotations: (a: Annotation[]) => void;
    on: (event: 'changeAnnotation', cb: () => void) => void;
    off: (event: 'changeAnnotation', cb: () => void) => void;
}
