import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AppState } from '@app/state';
import {
    WorkflowRunCompleteEvent,
    WorkflowRunStartedEvent,
    WorkflowRunStatusChangeEvent,
    WorkflowStepStatusChangeEvent,
} from '@app/classes/events/workflow';
import { JobDetailsModalComponent } from '@app/components/modals/job-details-modal/job-details-modal.component';
import { ConfirmationModalComponent } from '@app/components/modals/confirmation-modal/confirmation-modal.component';
import { TransferDirection } from '@app/interfaces/jobs-table';
import { BaseEvent } from '@app/interfaces/events';
import { WorkflowRun, WorkflowRunStatus, WorkflowStep, WorkflowStepStatus } from '@gen/es/fme/v1/workflow_pb';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { NotificationsService } from '@services/notifications/notifications.service';
import { ConnectionState } from '@state/models/connection-state-model';
import { Job, JobStatus } from '@state/models/job.model';
import { selectAll as selectAllJobs } from '@state/job/job.selectors';
import { initialTestState } from '@state/test.state';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowRunsTableComponent } from './workflow-runs-table.component';

/** Build a WorkflowStep fixture. */
function step(over: Partial<WorkflowStep> = {}): WorkflowStep {
    return {
        $typeName: 'fme.v1.WorkflowStep',
        stepId: 's1',
        name: 'Ingest',
        type: 'Job',
        status: WorkflowStepStatus.PENDING,
        jobId: '',
        error: '',
        ...over,
    };
}

/** Build a WorkflowRun fixture. */
function run(over: Partial<WorkflowRun> = {}): WorkflowRun {
    return {
        $typeName: 'fme.v1.WorkflowRun',
        runId: 'run-1',
        name: 'nightly',
        status: WorkflowRunStatus.RUNNING,
        steps: [step()],
        created: {$typeName: 'google.protobuf.Timestamp', seconds: BigInt(1_700_000_000), nanos: 0},
        ...over,
    };
}

/** Build a store Job fixture. */
function makeJob(over: Partial<Job> = {}): Job {
    return {
        id: 'job-1',
        name: 'Upload A',
        transferProfile: 'p',
        status: JobStatus.InProgress,
        statusMessage: '',
        totalBytes: 1000,
        bytesTransferred: 500,
        progress: 50,
        eta: 'Unknown',
        hasTaskErrors: false,
        hasSuccessfulTasks: true,
        lastUpdate: new Date(),
        destination: '/dest',
        direction: TransferDirection.Upload,
        timestampCreated: new Date(),
        timestampDiscovering: null,
        timestampChecksumming: null,
        timestampTransferring: new Date(),
        timestampCompleted: null,
        checksumProgress: null,
        force: false,
        ...over,
    };
}

describe('WorkflowRunsTableComponent', () => {
    let component: WorkflowRunsTableComponent;
    let fixture: ComponentFixture<WorkflowRunsTableComponent>;
    let store: MockStore<AppState>;

    let connectionState$: BehaviorSubject<ConnectionState>;
    let events$: Subject<BaseEvent>;
    let fmeClient: {
        connectionState: BehaviorSubject<ConnectionState>;
        events$: Subject<BaseEvent>;
        listWorkflowRuns: ReturnType<typeof vi.fn>;
        cancelWorkflowRun: ReturnType<typeof vi.fn>;
        pauseWorkflowRun: ReturnType<typeof vi.fn>;
        resumeWorkflowRun: ReturnType<typeof vi.fn>;
    };
    let notifications: Record<string, ReturnType<typeof vi.fn>>;
    let dialogOpen: ReturnType<typeof vi.fn>;

    function build(): void {
        connectionState$ = new BehaviorSubject<ConnectionState>(ConnectionState.DISCONNECTED);
        events$ = new Subject<BaseEvent>();
        fmeClient = {
            connectionState: connectionState$,
            events$: events$,
            listWorkflowRuns: vi.fn(() => of({runs: []})),
            cancelWorkflowRun: vi.fn(() => of({runId: 'run-1', success: true, error: ''})),
            pauseWorkflowRun: vi.fn(() => of({runId: 'run-1', success: true, error: ''})),
            resumeWorkflowRun: vi.fn(() => of({runId: 'run-1', success: true, error: ''})),
        };
        notifications = {success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn()};
        dialogOpen = vi.fn(() => ({afterClosed: () => of(true)}));

        TestBed.configureTestingModule({
            imports: [WorkflowRunsTableComponent],
            providers: [
                provideMockStore<AppState>({initialState: initialTestState}),
                {provide: FmeClientService, useValue: fmeClient},
                {provide: NotificationsService, useValue: notifications},
                {provide: MatDialog, useValue: {open: dialogOpen}},
            ],
        });
        store = TestBed.inject(MockStore);
        fixture = TestBed.createComponent(WorkflowRunsTableComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    beforeEach(() => build());

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('listing on connect', () => {
        it('seeds the runs from listWorkflowRuns when connected', () => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(of({runs: [run({runId: 'a'}), run({runId: 'b'})]}));
            connectionState$.next(ConnectionState.CONNECTED);
            expect(fmeClient.listWorkflowRuns).toHaveBeenCalled();
            expect(component.runs().map((r) => r.runId).sort()).toEqual(['a', 'b']);
        });

        it('does not list while disconnected', () => {
            expect(fmeClient.listWorkflowRuns).not.toHaveBeenCalled();
        });

        it('surfaces a list error as a notification', () => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(throwError(() => new Error('boom')));
            connectionState$.next(ConnectionState.CONNECTED);
            expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
        });

        it('sorts runs newest-first by created time', () => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(of({runs: [
                run({runId: 'old', created: {$typeName: 'google.protobuf.Timestamp', seconds: BigInt(100), nanos: 0}}), run({runId: 'new', created: {$typeName: 'google.protobuf.Timestamp', seconds: BigInt(200), nanos: 0}}),
            ]}));
            connectionState$.next(ConnectionState.CONNECTED);
            expect(component.runs().map((r) => r.runId)).toEqual(['new', 'old']);
        });

        it('treats a run with no created timestamp as oldest', () => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(of({runs: [
                run({runId: 'dated', created: {$typeName: 'google.protobuf.Timestamp', seconds: BigInt(100), nanos: 0}}), run({runId: 'undated', created: undefined}),
            ]}));
            connectionState$.next(ConnectionState.CONNECTED);
            expect(component.runs().map((r) => r.runId)).toEqual(['dated', 'undated']);
        });
    });

    describe('live events', () => {
        beforeEach(() => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(of({runs: [run({runId: 'run-1', status: WorkflowRunStatus.RUNNING})]}));
            connectionState$.next(ConnectionState.CONNECTED);
        });

        it('inserts a shell run on a started event for an unseen run', () => {
            events$.next(new WorkflowRunStartedEvent('run-2', 'adhoc', new Date()));
            const r = component.runs().find((x) => x.runId === 'run-2');
            expect(r?.status).toBe(WorkflowRunStatus.RUNNING);
            expect(r?.steps).toEqual([]);
        });

        it('marks an already-known run RUNNING on a started event', () => {
            events$.next(new WorkflowRunStartedEvent('run-1', 'nightly', new Date()));
            expect(component.runs().find((x) => x.runId === 'run-1')?.status).toBe(WorkflowRunStatus.RUNNING);
        });

        it('updates a run status on a status-change event', () => {
            events$.next(new WorkflowRunStatusChangeEvent('run-1', WorkflowRunStatus.PAUSED, new Date()));
            expect(component.runs()[0].status).toBe(WorkflowRunStatus.PAUSED);
        });

        it('sets terminal status and completed time on a complete event', () => {
            events$.next(new WorkflowRunCompleteEvent('run-1', 'nightly', WorkflowRunStatus.SUCCEEDED, new Date(1000)));
            const r = component.runs()[0];
            expect(r.status).toBe(WorkflowRunStatus.SUCCEEDED);
            expect(r.completed).toBeDefined();
        });

        it('updates one step status on a step-status-change event', () => {
            events$.next(new WorkflowStepStatusChangeEvent('run-1', 's1', WorkflowStepStatus.SUCCEEDED, new Date()));
            expect(component.runs()[0].steps[0].status).toBe(WorkflowStepStatus.SUCCEEDED);
        });

        it('leaves non-matching steps untouched on a step-status-change event', () => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(of({runs: [run({
                runId: 'run-9',
                steps: [step({stepId: 's1'}), step({stepId: 's2', status: WorkflowStepStatus.RUNNING})],
            })]}));
            component.refresh();
            events$.next(new WorkflowStepStatusChangeEvent('run-9', 's1', WorkflowStepStatus.SUCCEEDED, new Date()));
            const r = component.runs().find((x) => x.runId === 'run-9')!;
            expect(r.steps.find((s) => s.stepId === 's1')!.status).toBe(WorkflowStepStatus.SUCCEEDED);
            expect(r.steps.find((s) => s.stepId === 's2')!.status).toBe(WorkflowStepStatus.RUNNING);
        });

        it('ignores a status-change event for an unknown run', () => {
            events$.next(new WorkflowRunStatusChangeEvent('ghost', WorkflowRunStatus.PAUSED, new Date()));
            expect(component.runs().some((r) => r.runId === 'ghost')).toBe(false);
        });

        it('ignores an unrelated event type', () => {
            events$.next({logLevel: 0, logMessage: 'noise'} as unknown as BaseEvent);
            expect(component.runs().length).toBe(1);
        });
    });

    describe('terminal detection', () => {
        it('reports terminal for SUCCEEDED/FAILED/CANCELLED', () => {
            expect(component.isTerminal(run({status: WorkflowRunStatus.SUCCEEDED}))).toBe(true);
            expect(component.isTerminal(run({status: WorkflowRunStatus.FAILED}))).toBe(true);
            expect(component.isTerminal(run({status: WorkflowRunStatus.CANCELLED}))).toBe(true);
        });

        it('reports non-terminal for RUNNING/PAUSED/PENDING', () => {
            expect(component.isTerminal(run({status: WorkflowRunStatus.RUNNING}))).toBe(false);
            expect(component.isTerminal(run({status: WorkflowRunStatus.PAUSED}))).toBe(false);
            expect(component.isTerminal(run({status: WorkflowRunStatus.PENDING}))).toBe(false);
        });
    });

    describe('expand/collapse', () => {
        it('toggles the expanded run id', () => {
            const r = run({runId: 'run-1'});
            component.toggleExpand(r);
            expect(component.expandedRunId()).toBe('run-1');
            component.toggleExpand(r);
            expect(component.expandedRunId()).toBeNull();
        });
    });

    describe('cancel', () => {
        it('confirms, then calls cancelWorkflowRun on confirm', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(true)});
            component.cancelRun(run({runId: 'run-1'}));
            expect(dialogOpen).toHaveBeenCalledWith(ConfirmationModalComponent, expect.anything());
            expect(fmeClient.cancelWorkflowRun).toHaveBeenCalledWith('run-1');
        });

        it('does nothing when the confirmation is dismissed', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(false)});
            component.cancelRun(run({runId: 'run-1'}));
            expect(fmeClient.cancelWorkflowRun).not.toHaveBeenCalled();
        });

        it('surfaces an inline row error when the cancel RPC reports failure', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(true)});
            fmeClient.cancelWorkflowRun.mockReturnValueOnce(of({runId: 'run-1', success: false, error: 'already terminal'}));
            component.cancelRun(run({runId: 'run-1'}));
            expect(component.rowErrors()['run-1']).toBe('already terminal');
        });

        it('surfaces a generic row error when the cancel RPC throws', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(true)});
            fmeClient.cancelWorkflowRun.mockReturnValueOnce(throwError(() => new Error('rpc down')));
            component.cancelRun(run({runId: 'run-1'}));
            expect(component.rowErrors()['run-1']).toBe('rpc down');
        });

        it('uses a default message when the failure carries no error text', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(true)});
            fmeClient.cancelWorkflowRun.mockReturnValueOnce(of({runId: 'run-1', success: false, error: ''}));
            component.cancelRun(run({runId: 'run-1'}));
            expect(component.rowErrors()['run-1']).toBe('The run could not be updated.');
        });
    });

    describe('pause', () => {
        it('pauses the scheduler only when pauseInFlightJobs is false', () => {
            component.pauseRun(run({runId: 'run-1'}), false);
            expect(fmeClient.pauseWorkflowRun).toHaveBeenCalledWith('run-1', false);
        });

        it('pauses in-flight transfers too when pauseInFlightJobs is true', () => {
            component.pauseRun(run({runId: 'run-1'}), true);
            expect(fmeClient.pauseWorkflowRun).toHaveBeenCalledWith('run-1', true);
        });

        it('surfaces an inline row error when pause reports failure', () => {
            fmeClient.pauseWorkflowRun.mockReturnValueOnce(of({runId: 'run-1', success: false, error: 'nope'}));
            component.pauseRun(run({runId: 'run-1'}), false);
            expect(component.rowErrors()['run-1']).toBe('nope');
        });

        it('surfaces a row error when the pause RPC throws', () => {
            fmeClient.pauseWorkflowRun.mockReturnValueOnce(throwError(() => new Error('pause boom')));
            component.pauseRun(run({runId: 'run-1'}), true);
            expect(component.rowErrors()['run-1']).toBe('pause boom');
        });
    });

    describe('resume', () => {
        it('calls resumeWorkflowRun and clears a prior row error on success', () => {
            // Seed a prior error, then a successful resume should clear it.
            fmeClient.pauseWorkflowRun.mockReturnValueOnce(of({runId: 'run-1', success: false, error: 'stuck'}));
            component.pauseRun(run({runId: 'run-1'}), false);
            expect(component.rowErrors()['run-1']).toBe('stuck');

            component.resumeRun(run({runId: 'run-1'}));
            expect(fmeClient.resumeWorkflowRun).toHaveBeenCalledWith('run-1');
            expect(component.rowErrors()['run-1']).toBeUndefined();
        });

        it('leaves other rows untouched when clearing one row error', () => {
            fmeClient.pauseWorkflowRun.mockReturnValue(of({runId: 'x', success: false, error: 'e'}));
            component.pauseRun(run({runId: 'run-1'}), false);
            component.resumeRun(run({runId: 'run-2'})); // run-2 has no error; clear is a no-op
            expect(component.rowErrors()['run-1']).toBe('e');
        });

        it('surfaces a row error when the resume RPC throws', () => {
            fmeClient.resumeWorkflowRun.mockReturnValueOnce(throwError(() => new Error('resume boom')));
            component.resumeRun(run({runId: 'run-1'}));
            expect(component.rowErrors()['run-1']).toBe('resume boom');
        });

        it('stringifies a non-Error thrown value for the row error', () => {
            fmeClient.resumeWorkflowRun.mockReturnValueOnce(throwError(() => 'plain string failure'));
            component.resumeRun(run({runId: 'run-1'}));
            expect(component.rowErrors()['run-1']).toBe('plain string failure');
        });
    });

    describe('step -> job join', () => {
        it('does nothing for a step without a job id', async () => {
            await component.openStepJob(step({jobId: ''}));
            expect(dialogOpen).not.toHaveBeenCalled();
        });

        it('notifies when the job is not yet in the store', async () => {
            store.overrideSelector(selectAllJobs, []);
            store.refreshState();
            await component.openStepJob(step({jobId: 'job-1'}));
            expect(notifications.info).toHaveBeenCalled();
            expect(dialogOpen).not.toHaveBeenCalled();
        });

        it('opens the job-details modal for a known job', async () => {
            store.overrideSelector(selectAllJobs, [makeJob({id: 'job-1'})]);
            store.refreshState();
            await component.openStepJob(step({jobId: 'job-1'}));
            expect(dialogOpen).toHaveBeenCalledWith(JobDetailsModalComponent, expect.objectContaining({
                data: expect.objectContaining({jobId: 'job-1'}),
            }));
        });

        it('maps a job with missing optional fields to safe defaults', async () => {
            const job = makeJob({id: 'job-1', force: undefined as unknown as boolean, direction: undefined as unknown as TransferDirection});
            store.overrideSelector(selectAllJobs, [job]);
            store.refreshState();
            await component.openStepJob(step({jobId: 'job-1'}));
            const data = dialogOpen.mock.calls[0][1].data;
            expect(data.force).toBe(false);
            expect(data.direction).toBe(TransferDirection.Upload);
        });
    });

    describe('refresh', () => {
        it('replaces the run set from a manual refresh', () => {
            fmeClient.listWorkflowRuns.mockReturnValueOnce(of({runs: [run({runId: 'only'})]}));
            component.refresh();
            expect(component.runs().map((r) => r.runId)).toEqual(['only']);
        });
    });
});
