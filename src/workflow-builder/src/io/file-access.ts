import { mimeType } from './export-name';
import type { EditorFormat } from '../editor/editor-text';

// A file opened by the user: its text and its name (the name drives import format
// inference and the next export's default name).
export interface OpenedFile {
    name: string;
    text: string;
}

// The file-I/O seam (docs section 6): the rest of the app opens and saves through this
// interface and never calls a browser API directly, so a later Wails host can swap in
// native dialogs by implementing the same two methods. open() resolves undefined when
// the user cancels.
export interface FileAccess {
    open: () => Promise<OpenedFile | undefined>;
    save: (name: string, text: string, format: EditorFormat) => Promise<void>;
}

// The window.showOpenFilePicker / showSaveFilePicker surface (File System Access API),
// narrowed to what we use. Present only in Chromium-based browsers; elsewhere we fall
// back to a hidden <input> and a download link.
interface FileSystemCapableWindow extends Window {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike[]>;
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike>;
}
interface FileSystemFileHandleLike {
    getFile: () => Promise<File>;
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
}

const ACCEPT = '.yaml,.yml,.json';

/* v8 ignore start -- browser file-dialog + download glue: not runnable in jsdom, and
   driven only through the DOM. The import/export orchestration that consumes this is
   tested in App with a mock FileAccess; the pure helpers (export-name, import-text)
   are tested directly. Excluded like editor/lazy-code-editor. */

// Open a workflow file via the File System Access API where available, falling back to
// a hidden file input. Resolves undefined if the user cancels.
async function open(): Promise<OpenedFile | undefined> {
    const w = window as FileSystemCapableWindow;
    if (typeof w.showOpenFilePicker === 'function') {
        const handles = await w.showOpenFilePicker({
            types: [{ description: 'Workflow', accept: { 'application/yaml': ['.yaml', '.yml'], 'application/json': ['.json'] } }],
            multiple: false,
        }).catch(() => undefined);
        if (handles === undefined || handles.length === 0) {
            return undefined;
        }
        const file = await handles[0].getFile();
        return { name: file.name, text: await file.text() };
    }
    return openViaInput();
}

// Hidden-input fallback for browsers without the File System Access API.
function openViaInput(): Promise<OpenedFile | undefined> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ACCEPT;
        input.onchange = () => {
            const file = input.files?.[0];
            if (file === undefined) {
                resolve(undefined);
                return;
            }
            void file.text().then((text) => resolve({ name: file.name, text }));
        };
        input.click();
    });
}

// Save via the File System Access API where available, falling back to a Blob
// download.
async function save(name: string, text: string, format: EditorFormat): Promise<void> {
    const mime = mimeType(format);
    const w = window as FileSystemCapableWindow;
    if (typeof w.showSaveFilePicker === 'function') {
        const handle = await w.showSaveFilePicker({
            suggestedName: name,
            types: [{ description: 'Workflow', accept: { [mime]: [`.${format}`] } }],
        }).catch(() => undefined);
        if (handle === undefined) {
            return;
        }
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
    }
    downloadBlob(name, text, mime);
}

// Blob-download fallback: create an object URL and click a transient anchor.
function downloadBlob(name: string, text: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
}

export const browserFileAccess: FileAccess = { open, save };

/* v8 ignore stop */
