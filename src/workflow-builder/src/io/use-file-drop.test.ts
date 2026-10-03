import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFileDrop } from './use-file-drop';

// A dropped file (name + a text() promise), the slice of File we use.
function fileLike(name: string, text: string): File {
    return { name, text: () => Promise.resolve(text) } as unknown as File;
}

function dropEvent(files: File[]): Event {
    const e = new Event('drop', { cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { files } });
    return e;
}

// Dropping a workflow file onto the window opens it (docs section 6). The hook listens
// for window drag/drop, suppresses the browser's default (which would navigate away),
// and hands the dropped file's name + text to the callback.
describe('useFileDrop', () => {
    it('reads a dropped file and calls onFile with its name and text', async () => {
        const onFile = vi.fn();
        renderHook(() => useFileDrop(onFile));
        window.dispatchEvent(dropEvent([fileLike('wf.yaml', 'kind: Workflow')]));
        await waitFor(() => expect(onFile).toHaveBeenCalledWith({ name: 'wf.yaml', text: 'kind: Workflow' }));
    });

    it('prevents default on dragover so the window is a drop target', () => {
        renderHook(() => useFileDrop(vi.fn()));
        const over = new Event('dragover', { cancelable: true });
        window.dispatchEvent(over);
        expect(over.defaultPrevented).toBe(true);
    });

    it('ignores a drop with no files', async () => {
        const onFile = vi.fn();
        renderHook(() => useFileDrop(onFile));
        window.dispatchEvent(dropEvent([]));
        // Give any async read a tick; nothing should fire.
        await Promise.resolve();
        expect(onFile).not.toHaveBeenCalled();
    });

    it('stops listening after unmount', () => {
        const onFile = vi.fn();
        const { unmount } = renderHook(() => useFileDrop(onFile));
        unmount();
        window.dispatchEvent(dropEvent([fileLike('wf.yaml', 'x')]));
        expect(onFile).not.toHaveBeenCalled();
    });
});
