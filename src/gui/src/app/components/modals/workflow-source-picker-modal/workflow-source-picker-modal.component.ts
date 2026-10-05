import { ChangeDetectionStrategy, Component, inject, Signal, ViewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { BookmarksService } from '@services/bookmarks/bookmarks.service';
import { FSFolder } from '@classes/grpc';
import {
    FileBrowserData,
    FileBrowserObject,
    FileBrowserObjectType,
    FileBrowserState,
} from '@app/components/layout/file-browser/file-browser.interfaces';
import { FileBrowserComponent } from '@app/components/layout/file-browser/file-browser.component';

/** Dialog data: the directory the picker opens at. */
export interface WorkflowSourcePickerData {
    initialDirectory: string;
}

/**
 * A pick-mode modal that embeds the existing fme-file-browser for choosing one or more
 * source paths for a workflow string_array parameter (runner-GUI doc "The string_array
 * field and Browse"). It is SELECT-ONLY: no drag/drop or context-menu transfer actions
 * are wired (no contextMenuData, external drag disabled), so the browser is choosing
 * paths, not moving files. The user navigates and multi-selects with the browser's
 * native click / shift-click / cmd-click, and "Add selected" returns the chosen paths.
 *
 * The host (this modal) owns the listing: it fetches each directory via
 * listDaemonFolder and feeds the browser its FileBrowserData, exactly as the main
 * daemon browser does, so no new listing code is introduced.
 */
@Component({
    selector: 'fme-workflow-source-picker-modal',
    templateUrl: './workflow-source-picker-modal.component.html',
    styleUrls: ['./workflow-source-picker-modal.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        FileBrowserComponent,
        MatDialogTitle,
        MatDialogContent,
        MatDialogActions,
        MatDialogClose,
        MatIcon,
        MatIconButton,
        MatFormField,
        MatLabel,
        MatSelect,
        MatOption,
    ],
})
export class WorkflowSourcePickerModalComponent {
    private fmeClient = inject(FmeClientService);
    private bookmarks = inject(BookmarksService);
    private dialogRef = inject<MatDialogRef<WorkflowSourcePickerModalComponent, string[] | undefined>>(MatDialogRef);
    private data = inject<WorkflowSourcePickerData>(MAT_DIALOG_DATA);

    /** The embedded browser, read for its multi-selection on confirm. */
    @ViewChild(FileBrowserComponent) browser?: FileBrowserComponent;

    /**
     * The current bookmark's favorite paths, offered as a quick-jump dropdown so the user
     * can hop straight to a saved location instead of navigating from the root. Seeded
     * empty until the current bookmark emits.
     */
    readonly favoritePaths: Signal<string[]> = toSignal(
        this.bookmarks.current.pipe(map((bookmark) => bookmark.favoritePaths ?? [])),
        {initialValue: [] as string[]},
    );

    /** The directory currently listed. */
    currentDirectory = '';
    /** Whether the current directory is the root (hides the parent-directory row). */
    isRoot = false;
    /** The listing fed to the embedded browser. */
    fileBrowserData: FileBrowserData = {state: FileBrowserState.LOADING, list: [], error: null};

    constructor() {
        this.loadDirectory(this.data.initialDirectory || '/');
    }

    /** Fetch a directory's listing and feed it to the browser. */
    loadDirectory(path: string): void {
        this.fileBrowserData = {state: FileBrowserState.LOADING, list: [], error: null};
        this.fmeClient.listDaemonFolder(path).subscribe({
            next: (folder) => this.applyListing(path, folder),
            error: () => {
                this.fileBrowserData = {state: FileBrowserState.ERROR, list: [], error: null};
            },
        });
    }

    /** Map an FSFolder listing into FileBrowserData and set it as the current directory. */
    private applyListing(path: string, folder: FSFolder): void {
        const list: FileBrowserObject[] = [];
        for (const name of folder.folders) {
            list.push({name, size: null, dateModified: null, type: FileBrowserObjectType.FOLDER});
        }
        for (const file of folder.files) {
            list.push({name: file.path, size: file.size, dateModified: file.lastModified, type: FileBrowserObjectType.FILE});
        }
        this.currentDirectory = path;
        this.isRoot = path === '/' || path === '';
        this.fileBrowserData = {state: FileBrowserState.LOADED, list, error: null};
    }

    /**
     * Handle the browser's navigate event. The browser emits a folder's full name to
     * descend into, or the parent directory's path (via dirname) to go up.
     */
    onNavigate(target: string): void {
        this.loadDirectory(target || '/');
    }

    /** The number of currently-selected rows in the embedded browser. */
    selectedCount(): number {
        return this.browser ? this.browser.getSelectedObjects().length : 0;
    }

    /** Return the selected paths to the opener and close; a no-op when nothing is selected. */
    addSelected(): void {
        const selected = this.browser ? this.browser.getSelectedObjects() : [];
        if (selected.length === 0) {
            return;
        }
        this.dialogRef.close(selected.map((o) => o.name));
    }

    /** Close without returning a selection. */
    cancel(): void {
        this.dialogRef.close(undefined);
    }

    /** Jump the browser to a chosen favorite path (ignores an empty selection). */
    goToFavorite(path: string): void {
        if (!path) {
            return;
        }
        this.loadDirectory(path);
    }
}
