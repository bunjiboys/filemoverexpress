import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppState } from '@app/state';
import { provideMockStore } from '@ngrx/store/testing';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { NotificationsService } from '@services/notifications/notifications.service';
import { ConnectionState } from '@state/models/connection-state-model';
import { initialTestState } from '@state/test.state';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowRunsComponent } from './workflow-runs.component';

describe('WorkflowRunsComponent', () => {
    let component: WorkflowRunsComponent;
    let fixture: ComponentFixture<WorkflowRunsComponent>;

    beforeEach(() => {
        const fmeClient = {
            connectionState: new BehaviorSubject<ConnectionState>(ConnectionState.DISCONNECTED),
            events$: new Subject(),
            listWorkflowRuns: vi.fn(() => of({runs: []})),
            cancelWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
            pauseWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
            resumeWorkflowRun: vi.fn(() => of({runId: '', success: true, error: ''})),
        };

        TestBed.configureTestingModule({
            imports: [WorkflowRunsComponent],
            providers: [
                provideMockStore<AppState>({initialState: initialTestState}),
                {provide: FmeClientService, useValue: fmeClient},
                {provide: NotificationsService, useValue: {error: vi.fn(), info: vi.fn()}},
            ],
        });
        fixture = TestBed.createComponent(WorkflowRunsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('hosts the runs table', () => {
        expect(fixture.nativeElement.querySelector('fme-workflow-runs-table')).toBeTruthy();
    });
});
