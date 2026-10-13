import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableGroupComponent } from './table-group.component';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { provideMockStore } from '@ngrx/store/testing';
import { AppState } from '@app/state';
import { initialTestState } from '@state/test.state';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { NotificationsService } from '@services/notifications/notifications.service';
import { ConnectionState } from '@state/models/connection-state-model';
import { BaseEvent } from '@app/interfaces/events';
import { WorkflowRunnerComponent } from '@app/components/layout/workflow-runner/workflow-runner.component';

describe('TableGroupComponent', () => {
    let component: TableGroupComponent;
    let fixture: ComponentFixture<TableGroupComponent>;
    let dialogOpen: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        dialogOpen = vi.fn(() => ({afterClosed: () => of(true)}));
        const fmeClient = {
            connectionState: new BehaviorSubject<ConnectionState>(ConnectionState.DISCONNECTED),
            events$: new Subject<BaseEvent>(),
            listWorkflowRuns: vi.fn(() => of({runs: []})),
            cancelWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
            pauseWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
            resumeWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
            deleteWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
        };
        const notifications = {success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn()};

        TestBed.configureTestingModule({
            imports: [
                MatSnackBarModule,
                MatTabsModule,
                MatMenuModule,
                FormsModule,
                ReactiveFormsModule,
                MatFormFieldModule,
                MatIconModule,
                MatSelectModule,
                MatProgressBarModule,
                MatTableModule,
                MatDialogModule,
                MatInputModule,
            ],
            providers: [
                provideMockStore<AppState>({initialState: initialTestState}),
                {provide: FmeClientService, useValue: fmeClient},
                {provide: NotificationsService, useValue: notifications},
                {provide: MatDialog, useValue: {open: dialogOpen}},
            ],
        });
        fixture = TestBed.createComponent(TableGroupComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('opens the workflow runner when starting a workflow while connected', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (component as any).connected = () => true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (component as any).startWorkflow();
        expect(dialogOpen).toHaveBeenCalledWith(
            WorkflowRunnerComponent,
            expect.objectContaining({panelClass: 'settings-dialog'}),
        );
    });

    it('does not open the workflow runner while disconnected', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (component as any).connected = () => false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (component as any).startWorkflow();
        expect(dialogOpen).not.toHaveBeenCalled();
    });
});
