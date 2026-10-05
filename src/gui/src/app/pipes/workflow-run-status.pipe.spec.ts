import { describe, expect, it } from 'vitest';
import { WorkflowRunStatus, WorkflowStep, WorkflowStepStatus } from '@gen/es/fme/v1/workflow_pb';
import {
    WorkflowRunStatusClassPipe,
    WorkflowRunStatusPipe,
    WorkflowStepRollupPipe,
    WorkflowStepStatusClassPipe,
    WorkflowStepStatusPipe,
} from './workflow-run-status.pipe';

/** Build a WorkflowStep with a given status; only status matters for the rollup. */
function step(status: WorkflowStepStatus): WorkflowStep {
    return {
        $typeName: 'fme.v1.WorkflowStep',
        stepId: 's',
        name: 'n',
        type: 'Upload',
        status,
        jobId: '',
        error: '',
    };
}

describe('WorkflowRunStatusPipe', () => {
    const pipe = new WorkflowRunStatusPipe();

    it('maps each run status to a human label', () => {
        expect(pipe.transform(WorkflowRunStatus.PENDING)).toBe('Pending');
        expect(pipe.transform(WorkflowRunStatus.RUNNING)).toBe('Running');
        expect(pipe.transform(WorkflowRunStatus.PAUSED)).toBe('Paused');
        expect(pipe.transform(WorkflowRunStatus.SUCCEEDED)).toBe('Succeeded');
        expect(pipe.transform(WorkflowRunStatus.FAILED)).toBe('Failed');
        expect(pipe.transform(WorkflowRunStatus.CANCELLED)).toBe('Cancelled');
    });

    it('falls back to Unknown for an unspecified status', () => {
        expect(pipe.transform(WorkflowRunStatus.UNSPECIFIED)).toBe('Unknown');
    });
});

describe('WorkflowRunStatusClassPipe', () => {
    const pipe = new WorkflowRunStatusClassPipe();

    it('maps each run status to a pill class', () => {
        expect(pipe.transform(WorkflowRunStatus.PENDING)).toBe('status-queued');
        expect(pipe.transform(WorkflowRunStatus.RUNNING)).toBe('status-in-progress');
        expect(pipe.transform(WorkflowRunStatus.PAUSED)).toBe('status-paused');
        expect(pipe.transform(WorkflowRunStatus.SUCCEEDED)).toBe('status-completed');
        expect(pipe.transform(WorkflowRunStatus.FAILED)).toBe('status-error');
        expect(pipe.transform(WorkflowRunStatus.CANCELLED)).toBe('status-cancelled');
    });

    it('returns empty for an unspecified status', () => {
        expect(pipe.transform(WorkflowRunStatus.UNSPECIFIED)).toBe('');
    });
});

describe('WorkflowStepStatusPipe', () => {
    const pipe = new WorkflowStepStatusPipe();

    it('maps each step status to a human label', () => {
        expect(pipe.transform(WorkflowStepStatus.PENDING)).toBe('Pending');
        expect(pipe.transform(WorkflowStepStatus.RUNNING)).toBe('Running');
        expect(pipe.transform(WorkflowStepStatus.SUCCEEDED)).toBe('Succeeded');
        expect(pipe.transform(WorkflowStepStatus.FAILED)).toBe('Failed');
        expect(pipe.transform(WorkflowStepStatus.SKIPPED)).toBe('Skipped');
    });

    it('falls back to Unknown for an unspecified step status', () => {
        expect(pipe.transform(WorkflowStepStatus.UNSPECIFIED)).toBe('Unknown');
    });
});

describe('WorkflowStepStatusClassPipe', () => {
    const pipe = new WorkflowStepStatusClassPipe();

    it('maps each step status to a pill class', () => {
        expect(pipe.transform(WorkflowStepStatus.PENDING)).toBe('status-queued');
        expect(pipe.transform(WorkflowStepStatus.RUNNING)).toBe('status-in-progress');
        expect(pipe.transform(WorkflowStepStatus.SUCCEEDED)).toBe('status-completed');
        expect(pipe.transform(WorkflowStepStatus.FAILED)).toBe('status-error');
        expect(pipe.transform(WorkflowStepStatus.SKIPPED)).toBe('status-skipped');
    });

    it('returns empty for an unspecified step status', () => {
        expect(pipe.transform(WorkflowStepStatus.UNSPECIFIED)).toBe('');
    });
});

describe('WorkflowStepRollupPipe', () => {
    const pipe = new WorkflowStepRollupPipe();

    it('counts succeeded steps out of the total', () => {
        const steps = [
            step(WorkflowStepStatus.SUCCEEDED),
            step(WorkflowStepStatus.SUCCEEDED),
            step(WorkflowStepStatus.RUNNING),
            step(WorkflowStepStatus.PENDING),
            step(WorkflowStepStatus.FAILED),
        ];
        expect(pipe.transform(steps)).toBe('2/5 steps succeeded');
    });

    it('uses the singular when there is one step', () => {
        expect(pipe.transform([step(WorkflowStepStatus.SUCCEEDED)])).toBe('1/1 step succeeded');
    });

    it('reports no steps for an empty run', () => {
        expect(pipe.transform([])).toBe('No steps');
    });
});
