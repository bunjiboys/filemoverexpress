import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/list';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import {
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    MatTable,
} from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { handleStreamError } from '@app/classes/rxjs-operators';
import {
    WorkflowRunCompleteEvent,
    WorkflowRunStartedEvent,
    WorkflowRunStatusChangeEvent,
    WorkflowStepStatusChangeEvent,
} from '@app/classes/events/workflow';
import {
    ConfirmationModalComponent,
} from '@app/components/modals/confirmation-modal/confirmation-modal.component';
import { ConfirmationModalData } from '@app/components/modals/confirmation-modal/confirmation-modal.interfaces';
import { JobDetailsModalComponent } from '@app/components/modals/job-details-modal/job-details-modal.component';
import { JobDetailsData, TransferDirection } from '@app/interfaces/jobs-table';
import { BaseEvent } from '@app/interfaces/events';
import {
    WorkflowRunStatusClassPipe,
    WorkflowRunStatusPipe,
    WorkflowStepRollupPipe,
    WorkflowStepStatusClassPipe,
    WorkflowStepStatusPipe,
} from '@app/pipes/workflow-run-status.pipe';
import { WorkflowRun, WorkflowRunStatus, WorkflowStep, WorkflowStepStatus } from '@gen/es/fme/v1/workflow_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Store } from '@ngrx/store';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { NotificationsService } from '@services/notifications/notifications.service';
import { ConnectionState } from '@state/models/connection-state-model';
import { Job } from '@state/models/job.model';
import { selectAll as selectAllJobs } from '@state/job/job.selectors';
import { distinctUntilChanged, firstValueFrom } from 'rxjs';

const RETRY_COUNT = 5;

/** Run statuses whose controls are still actionable (not terminal). */
const TERMINAL_RUN_STATES: readonly WorkflowRunStatus[] = [
    WorkflowRunStatus.SUCCEEDED,
    WorkflowRunStatus.FAILED,
    WorkflowRunStatus.CANCELLED,
];

/**
 * The runs management view (runner-GUI doc section 7). Lists every workflow run from
 * ListWorkflowRuns -- including finished runs persisted across daemon restarts -- as a
 * table (name, status, per-step rollup, timestamps), kept live from the four run-lifecycle
 * events on the existing ListEvents stream. Each non-terminal run offers Cancel / Pause /
 * Resume, each calling one lifecycle RPC and reflecting the subsequent status-change event.
 *
 * Rows expand to show their steps; a Job step links to its runtime job via the existing
 * ListJobs surface (the job-details modal), so this view composes with the job surface
 * rather than duplicating it.
 */
@Component({
    selector: 'fme-workflow-runs-table',
    templateUrl: './workflow-runs-table.component.html',
    styleUrls: ['./workflow-runs-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DatePipe,
        MatTable,
        MatColumnDef,
        MatCell,
        MatCellDef,
        MatHeaderCell,
        MatHeaderCellDef,
        MatHeaderRow,
        MatHeaderRowDef,
        MatRow,
        MatRowDef,
        MatIcon,
        MatIconButton,
        MatMenu,
        MatMenuContent,
        MatMenuItem,
        MatMenuTrigger,
        MatDivider,
        MatTooltip,
        WorkflowRunStatusPipe,
        WorkflowRunStatusClassPipe,
        WorkflowStepStatusPipe,
        WorkflowStepStatusClassPipe,
        WorkflowStepRollupPipe,
    ],
})
export class WorkflowRunsTableComponent {
    private fmeClient = inject(FmeClientService);
    private store = inject(Store);
    private dialog = inject(MatDialog);
    private notifications = inject(NotificationsService);
    private destroyRef = inject(DestroyRef);

    /** Expose the status enums to the template for terminal/visibility checks. */
    readonly RunStatus = WorkflowRunStatus;
    readonly StepStatus = WorkflowStepStatus;

    /** All known runs, keyed by run id, kept live from the lifecycle events. */
    private readonly runsById = signal<Map<string, WorkflowRun>>(new Map());

    /** Runs for the table, newest first (by created, falling back to run id). */
    readonly runs = computed<WorkflowRun[]>(() =>
        [...this.runsById().values()].sort((a, b) => runSortKey(b) - runSortKey(a)),
    );

    /** The run id whose steps are expanded, or null when all rows are collapsed. */
    readonly expandedRunId = signal<string | null>(null);

    /** Per-run inline error (unknown/terminal run from an idempotent RPC), keyed by run id. */
    readonly rowErrors = signal<Record<string, string>>({});

    readonly displayedColumns = ['expand',
        'name',
        'status',
        'progress',
        'created',
        'completed',
        'actions'];

    constructor() {
        // Seed the list from the daemon whenever a connection is (re)established, then keep
        // it live from the event stream. A reconnect re-lists so a run that finished while
        // disconnected shows its terminal state (reconciliation marks an interrupted run FAILED).
        this.fmeClient.connectionState.pipe(
            distinctUntilChanged(),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((state) => {
            if (state === ConnectionState.CONNECTED) {
                this.refresh();
            }
        });

        this.fmeClient.events$.pipe(
            handleStreamError({retryCount: RETRY_COUNT}),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((evt) => this.applyEvent(evt));
    }

    /** Re-list all runs from the daemon, replacing the current set. */
    refresh(): void {
        this.fmeClient.listWorkflowRuns().subscribe({
            next: (res) => {
                const next = new Map<string, WorkflowRun>();
                for (const run of res.runs) {
                    next.set(run.runId, run);
                }
                this.runsById.set(next);
            },
            error: (err: unknown) => this.notifications.error(`Unable to list workflow runs: ${errorText(err)}`),
        });
    }

    /** Toggle the expanded steps panel for a run row. */
    toggleExpand(run: WorkflowRun): void {
        this.expandedRunId.update((current) => (current === run.runId ? null : run.runId));
    }

    /** Whether a run is in a terminal state (controls hidden/disabled). */
    isTerminal(run: WorkflowRun): boolean {
        return TERMINAL_RUN_STATES.includes(run.status);
    }

    /**
     * Cancel a run after a confirmation (irreversible, may abort large transfers). Shown
     * for RUNNING or PAUSED. The daemon is authoritative; its error (unknown/terminal run)
     * is surfaced inline on the row.
     */
    cancelRun(run: WorkflowRun): void {
        const data: Partial<ConfirmationModalData> = {
            title: 'Cancel workflow run?',
            message: `Cancelling "${run.name}" stops scheduling, skips not-yet-started steps, and `
                + 'aborts any in-flight transfers. This cannot be undone.',
            confirmText: 'Cancel run',
            confirmClass: 'warn',
            cancelText: 'Keep running',
        };
        this.dialog.open<ConfirmationModalComponent, Partial<ConfirmationModalData>, boolean>(
            ConfirmationModalComponent,
            {data, width: '460px'},
        ).afterClosed().subscribe((confirmed) => {
            if (!confirmed) {
                return;
            }
            this.fmeClient.cancelWorkflowRun(run.runId).subscribe({
                next: (res) => this.reflectResult(run.runId, res.success, res.error),
                error: (err: unknown) => this.setRowError(run.runId, errorText(err)),
            });
        });
    }

    /**
     * Pause a run. pauseInFlightJobs=false gates the scheduler only (running transfers
     * finish); true also suspends in-flight Job steps. Shown for RUNNING only.
     */
    pauseRun(run: WorkflowRun, pauseInFlightJobs: boolean): void {
        this.fmeClient.pauseWorkflowRun(run.runId, pauseInFlightJobs).subscribe({
            next: (res) => this.reflectResult(run.runId, res.success, res.error),
            error: (err: unknown) => this.setRowError(run.runId, errorText(err)),
        });
    }

    /** Resume a paused run. Shown for PAUSED only. */
    resumeRun(run: WorkflowRun): void {
        this.fmeClient.resumeWorkflowRun(run.runId).subscribe({
            next: (res) => this.reflectResult(run.runId, res.success, res.error),
            error: (err: unknown) => this.setRowError(run.runId, errorText(err)),
        });
    }

    /**
     * Open the runtime job behind a Job step, joining the runs view to the jobs view by the
     * step's job_id. Looks the job up in the existing job store (populated by ListJobs);
     * notifies if the job is not (yet) known.
     */
    async openStepJob(step: WorkflowStep): Promise<void> {
        if (!step.jobId) {
            return;
        }
        const jobs = await firstValueFrom(this.store.select(selectAllJobs));
        const job = jobs.find((j) => j.id === step.jobId);
        if (!job) {
            this.notifications.info('That step\'s job is not available yet.');
            return;
        }
        this.dialog.open<JobDetailsModalComponent, JobDetailsData>(JobDetailsModalComponent, {
            minWidth: '820px',
            width: '60%',
            maxWidth: '1100px',
            height: '85%',
            maxHeight: '1000px',
            autoFocus: false,
            data: jobDetailsData(job),
        });
    }

    /** Surface an inline row error from a failed RPC, or clear it on success. */
    private reflectResult(runId: string, success: boolean, error: string): void {
        if (success) {
            this.clearRowError(runId);
            return;
        }
        this.setRowError(runId, error || 'The run could not be updated.');
    }

    private setRowError(runId: string, message: string): void {
        this.rowErrors.update((errors) => ({...errors, [runId]: message}));
    }

    private clearRowError(runId: string): void {
        this.rowErrors.update((errors) => {
            if (!(runId in errors)) {
                return errors;
            }
            const next = {...errors};
            delete next[runId];
            return next;
        });
    }

    /** Fold a lifecycle event into the live run set. */
    private applyEvent(evt: BaseEvent): void {
        if (evt instanceof WorkflowRunStartedEvent) {
            this.onRunStarted(evt);
        } else if (evt instanceof WorkflowRunStatusChangeEvent) {
            this.patchRun(evt.runId, (run) => ({...run, status: evt.status}));
        } else if (evt instanceof WorkflowRunCompleteEvent) {
            this.patchRun(evt.runId, (run) => ({...run, status: evt.status, completed: dateToTimestamp(evt.completed)}));
        } else if (evt instanceof WorkflowStepStatusChangeEvent) {
            this.onStepStatusChange(evt);
        }
    }

    /**
     * A run started: insert a shell row if unseen (its steps fill in from subsequent step
     * events and the next refresh), otherwise mark it RUNNING.
     */
    private onRunStarted(evt: WorkflowRunStartedEvent): void {
        const existing = this.runsById().get(evt.runId);
        if (existing) {
            this.patchRun(evt.runId, (run) => ({...run, status: WorkflowRunStatus.RUNNING}));
            return;
        }
        this.upsertRun({
            $typeName: 'fme.v1.WorkflowRun',
            runId: evt.runId,
            name: evt.name,
            status: WorkflowRunStatus.RUNNING,
            steps: [],
            started: dateToTimestamp(evt.started),
        });
    }

    /** Update one step's status within its run; unknown runs are ignored (a refresh fills them). */
    private onStepStatusChange(evt: WorkflowStepStatusChangeEvent): void {
        this.patchRun(evt.runId, (run) => ({
            ...run,
            steps: run.steps.map((step) => (step.stepId === evt.stepId ? {...step, status: evt.status} : step)),
        }));
    }

    /** Apply a patch to a known run; no-op when the run id is not in the set. */
    private patchRun(runId: string, patch: (run: WorkflowRun) => WorkflowRun): void {
        const existing = this.runsById().get(runId);
        if (!existing) {
            return;
        }
        this.upsertRun(patch(existing));
    }

    /** Insert or replace a run in the live set (copy-on-write so the signal re-emits). */
    private upsertRun(run: WorkflowRun): void {
        this.runsById.update((map) => {
            const next = new Map(map);
            next.set(run.runId, run);
            return next;
        });
    }
}

/** Sort key for a run row: created time in ms, falling back to 0 when unset. */
function runSortKey(run: WorkflowRun): number {
    return run.created ? timestampDate(run.created).getTime() : 0;
}

/** Convert a Date to a protobuf Timestamp (for events that carry a decoded Date). */
function dateToTimestamp(date: Date): WorkflowRun['completed'] {
    const ms = date.getTime();
    return {
        $typeName: 'google.protobuf.Timestamp',
        seconds: BigInt(Math.floor(ms / 1000)),
        nanos: (ms % 1000) * 1e6,
    };
}

/** Map a store Job to the job-details modal's data shape (same mapping the jobs table uses). */
function jobDetailsData(job: Job): JobDetailsData {
    return {
        jobId: job.id,
        jobName: job.name,
        direction: job.direction ?? TransferDirection.Upload,
        destination: job.destination,
        remoteConfiguration: job.transferProfile,
        started: job.timestampCreated,
        completed: job.timestampCompleted,
        status: job.status,
        statusMessage: job.statusMessage,
        totalBytes: job.totalBytes,
        bytesTransferred: job.bytesTransferred,
        progress: job.progress,
        timestampTransferring: job.timestampTransferring,
        hasTaskErrors: job.hasTaskErrors,
        hasSuccessfulTasks: job.hasSuccessfulTasks,
        force: job.force ?? false,
    };
}

/** Extract a human-readable message from a thrown value. */
function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

