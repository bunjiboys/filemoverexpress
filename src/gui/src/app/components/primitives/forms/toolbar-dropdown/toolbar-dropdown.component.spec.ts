import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { AppState } from '@app/state';
import { StoreModule } from '@ngrx/store';
import { provideMockStore } from '@ngrx/store/testing';
import { initialTestState } from '@state/test.state';
import { ToolbarDropdownComponent } from './toolbar-dropdown.component';
import { WorkflowRunnerComponent } from '@app/components/layout/workflow-runner/workflow-runner.component';
import { WorkflowRunsComponent } from '@app/components/layout/workflow-runs/workflow-runs.component';
import { provideRouter } from '@angular/router';

describe('ToolbarDropdownComponent', () => {
    let component: ToolbarDropdownComponent;
    let fixture: ComponentFixture<ToolbarDropdownComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [
                MatSnackBarModule,
                MatMenuModule,
                MatIconModule,
                MatDialogModule,
                MatDividerModule,
                StoreModule,
            ],
            providers: [
                provideMockStore<AppState>({initialState: initialTestState}), provideRouter([]),
            ],
        });
        fixture = TestBed.createComponent(ToolbarDropdownComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('opens the workflow runner dialog when connected', () => {
        component.connected = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const open = vi.spyOn((component as any).dialog, 'open');
        component.openWorkflowRunner();
        expect(open).toHaveBeenCalledWith(WorkflowRunnerComponent, expect.objectContaining({panelClass: 'settings-dialog'}));
    });

    it('does not open the workflow runner when disconnected', () => {
        component.connected = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const open = vi.spyOn((component as any).dialog, 'open');
        component.openWorkflowRunner();
        expect(open).not.toHaveBeenCalled();
    });

    it('opens the workflow runs view when connected', () => {
        component.connected = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const open = vi.spyOn((component as any).dialog, 'open');
        component.openWorkflowRuns();
        expect(open).toHaveBeenCalledWith(WorkflowRunsComponent, expect.objectContaining({panelClass: 'settings-dialog'}));
    });

    it('does not open the workflow runs view when disconnected', () => {
        component.connected = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const open = vi.spyOn((component as any).dialog, 'open');
        component.openWorkflowRuns();
        expect(open).not.toHaveBeenCalled();
    });
});
