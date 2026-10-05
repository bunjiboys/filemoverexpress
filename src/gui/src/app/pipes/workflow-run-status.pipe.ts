import { Pipe, PipeTransform } from '@angular/core';
import { WorkflowRunStatus, WorkflowStep, WorkflowStepStatus } from '@gen/es/fme/v1/workflow_pb';

/**
 * Human-readable label for a run's overall status. Mirrors the proto enum
 * (fme.v1.WorkflowRunStatus) rather than deriving from strings, so an added enum member
 * is a compile-time concern.
 */
@Pipe({
    name: 'workflowRunStatus',
})
export class WorkflowRunStatusPipe implements PipeTransform {
    transform(status: WorkflowRunStatus): string {
        switch (status) {
            case WorkflowRunStatus.PENDING:
                return 'Pending';
            case WorkflowRunStatus.RUNNING:
                return 'Running';
            case WorkflowRunStatus.PAUSED:
                return 'Paused';
            case WorkflowRunStatus.SUCCEEDED:
                return 'Succeeded';
            case WorkflowRunStatus.FAILED:
                return 'Failed';
            case WorkflowRunStatus.CANCELLED:
                return 'Cancelled';
            default:
                return 'Unknown';
        }
    }
}

/**
 * Pill class for a run's overall status. Reuses the shared status-* pill classes the
 * jobs table already styles, so run and job pills read consistently.
 */
@Pipe({
    name: 'workflowRunStatusClass',
})
export class WorkflowRunStatusClassPipe implements PipeTransform {
    transform(status: WorkflowRunStatus): string {
        switch (status) {
            case WorkflowRunStatus.PENDING:
                return 'status-queued';
            case WorkflowRunStatus.RUNNING:
                return 'status-in-progress';
            case WorkflowRunStatus.PAUSED:
                return 'status-paused';
            case WorkflowRunStatus.SUCCEEDED:
                return 'status-completed';
            case WorkflowRunStatus.FAILED:
                return 'status-error';
            case WorkflowRunStatus.CANCELLED:
                return 'status-cancelled';
            default:
                return '';
        }
    }
}

/** Human-readable label for a single step's status. */
@Pipe({
    name: 'workflowStepStatus',
})
export class WorkflowStepStatusPipe implements PipeTransform {
    transform(status: WorkflowStepStatus): string {
        switch (status) {
            case WorkflowStepStatus.PENDING:
                return 'Pending';
            case WorkflowStepStatus.RUNNING:
                return 'Running';
            case WorkflowStepStatus.SUCCEEDED:
                return 'Succeeded';
            case WorkflowStepStatus.FAILED:
                return 'Failed';
            case WorkflowStepStatus.SKIPPED:
                return 'Skipped';
            default:
                return 'Unknown';
        }
    }
}

/** Pill class for a single step's status, reusing the shared status-* classes. */
@Pipe({
    name: 'workflowStepStatusClass',
})
export class WorkflowStepStatusClassPipe implements PipeTransform {
    transform(status: WorkflowStepStatus): string {
        switch (status) {
            case WorkflowStepStatus.PENDING:
                return 'status-queued';
            case WorkflowStepStatus.RUNNING:
                return 'status-in-progress';
            case WorkflowStepStatus.SUCCEEDED:
                return 'status-completed';
            case WorkflowStepStatus.FAILED:
                return 'status-error';
            case WorkflowStepStatus.SKIPPED:
                return 'status-skipped';
            default:
                return '';
        }
    }
}

/**
 * Per-step rollup for a run row, e.g. "3/5 steps succeeded" (runner-GUI doc section 7).
 * Counts SUCCEEDED steps against the total so the user sees progress at a glance without
 * expanding the row.
 */
@Pipe({
    name: 'workflowStepRollup',
})
export class WorkflowStepRollupPipe implements PipeTransform {
    transform(steps: WorkflowStep[]): string {
        const total = steps.length;
        if (total === 0) {
            return 'No steps';
        }
        const succeeded = steps.filter((s) => s.status === WorkflowStepStatus.SUCCEEDED).length;
        const noun = total === 1 ? 'step' : 'steps';
        return `${succeeded}/${total} ${noun} succeeded`;
    }
}
