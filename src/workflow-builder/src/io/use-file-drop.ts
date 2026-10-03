import { useEffect } from 'react';
import type { OpenedFile } from './file-access';

// Open a workflow by dropping its file onto the window (docs section 6). The hook
// suppresses the browser default on dragover/drop (which would otherwise navigate the
// page to the file), reads the first dropped file, and hands its name + text to
// onFile. A drop carrying no file is ignored. The read is pure DOM but small enough to
// test with synthetic events, so it is not excluded.
export function useFileDrop(onFile: (file: OpenedFile) => void): void {
    useEffect(() => {
        const onDragOver = (e: Event): void => {
            e.preventDefault();
        };
        const onDrop = (e: Event): void => {
            e.preventDefault();
            const file = (e as DragEvent).dataTransfer?.files?.[0];
            if (file === undefined) {
                return;
            }
            void file.text().then((text) => onFile({ name: file.name, text }));
        };
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('drop', onDrop);
        };
    }, [onFile]);
}
