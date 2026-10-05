import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { BookmarksService } from '@services/bookmarks/bookmarks.service';
import { FSFolder } from '@classes/grpc';
import { FSFile } from '@app/classes/grpc/fsfile';
import { FileBrowserObjectType, FileBrowserState } from '@app/components/layout/file-browser/file-browser.interfaces';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    WorkflowSourcePickerModalComponent,
    WorkflowSourcePickerData,
} from './workflow-source-picker-modal.component';

function folder(path: string, folders: string[] = [], files: FSFile[] = []): FSFolder {
    return new FSFolder(path, folders, files);
}

describe('WorkflowSourcePickerModalComponent', () => {
    let component: WorkflowSourcePickerModalComponent;
    let fixture: ComponentFixture<WorkflowSourcePickerModalComponent>;

    let listDaemonFolder: ReturnType<typeof vi.fn>;
    let close: ReturnType<typeof vi.fn>;
    let current$: BehaviorSubject<{favoritePaths: string[]}>;

    function build(data: WorkflowSourcePickerData = {initialDirectory: '/vol'}): void {
        listDaemonFolder = vi.fn(() => of(folder('/vol', ['/vol/cardA', '/vol/cardB'], [new FSFile('/vol/notes.txt', 10n, null)])));
        close = vi.fn();
        current$ = new BehaviorSubject<{favoritePaths: string[]}>({favoritePaths: ['/media/clips', '/vol/archive']});

        TestBed.configureTestingModule({
            imports: [WorkflowSourcePickerModalComponent],
            providers: [
                {provide: FmeClientService, useValue: {listDaemonFolder}},
                {provide: BookmarksService, useValue: {current: current$.asObservable()}},
                {provide: MatDialogRef, useValue: {close}},
                {provide: MAT_DIALOG_DATA, useValue: data},
            ],
        });
        fixture = TestBed.createComponent(WorkflowSourcePickerModalComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    beforeEach(() => build());

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('initial listing', () => {
        it('fetches the initial directory and maps folders + files to browser objects', () => {
            expect(listDaemonFolder).toHaveBeenCalledWith('/vol');
            expect(component.currentDirectory).toBe('/vol');
            expect(component.fileBrowserData.state).toBe(FileBrowserState.LOADED);
            const list = component.fileBrowserData.list;
            expect(list).toHaveLength(3);
            expect(list[0]).toMatchObject({name: '/vol/cardA', type: FileBrowserObjectType.FOLDER});
            expect(list[2]).toMatchObject({name: '/vol/notes.txt', type: FileBrowserObjectType.FILE});
        });

        it('shows an error state when the listing fails', () => {
            listDaemonFolder.mockReturnValue(throwError(() => new Error('denied')));
            component.loadDirectory('/vol');
            expect(component.fileBrowserData.state).toBe(FileBrowserState.ERROR);
        });
    });

    describe('navigation', () => {
        it('navigates into a folder by its full name', () => {
            component.onNavigate('/vol/cardA');
            expect(listDaemonFolder).toHaveBeenCalledWith('/vol/cardA');
        });

        it('navigates to the parent directory via the dirname', () => {
            component.onNavigate('/vol'.replace(/\/[^/]*$/, '') || '/');
            // parent of /vol is / -> listDaemonFolder('/')
            expect(listDaemonFolder).toHaveBeenCalledWith('/');
        });
    });

    describe('selection + confirm', () => {
        it('closes with the selected folder paths on Add selected', () => {
            // Simulate the embedded browser's multi-selection.
            component.browser = {
                getSelectedObjects: () => [
                    {name: '/vol/cardA', size: null, dateModified: null, type: FileBrowserObjectType.FOLDER}, {name: '/vol/cardB', size: null, dateModified: null, type: FileBrowserObjectType.FOLDER},
                ],
            } as unknown as WorkflowSourcePickerModalComponent['browser'];

            component.addSelected();

            expect(close).toHaveBeenCalledWith(['/vol/cardA', '/vol/cardB']);
        });

        it('does not close when nothing is selected', () => {
            component.browser = {
                getSelectedObjects: () => [],
            } as unknown as WorkflowSourcePickerModalComponent['browser'];

            component.addSelected();

            expect(close).not.toHaveBeenCalled();
        });

        it('reports the selected count', () => {
            component.browser = {
                getSelectedObjects: () => [
                    {name: '/vol/cardA', size: null, dateModified: null, type: FileBrowserObjectType.FOLDER},
                ],
            } as unknown as WorkflowSourcePickerModalComponent['browser'];
            expect(component.selectedCount()).toBe(1);
        });

        it('reports zero selected before the browser view initializes', () => {
            component.browser = undefined as unknown as WorkflowSourcePickerModalComponent['browser'];
            expect(component.selectedCount()).toBe(0);
        });

        it('cancels without returning a selection', () => {
            component.cancel();
            expect(close).toHaveBeenCalledWith(undefined);
        });
    });

    describe('favorite paths', () => {
        it('exposes the current bookmark favorite paths', () => {
            expect(component.favoritePaths()).toEqual(['/media/clips', '/vol/archive']);
        });

        it('navigates to a selected favorite path', () => {
            component.goToFavorite('/media/clips');
            expect(listDaemonFolder).toHaveBeenCalledWith('/media/clips');
        });

        it('ignores an empty favorite selection', () => {
            listDaemonFolder.mockClear();
            component.goToFavorite('');
            expect(listDaemonFolder).not.toHaveBeenCalled();
        });

        it('reflects an empty favorites list when the bookmark has none', () => {
            current$.next({favoritePaths: []});
            fixture.detectChanges();
            expect(component.favoritePaths()).toEqual([]);
        });
    });
});
