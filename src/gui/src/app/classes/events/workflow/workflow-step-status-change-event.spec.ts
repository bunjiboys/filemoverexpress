import { describe, it, expect } from 'vitest';
import { WorkflowStepStatusChangeEvent } from './workflow-step-status-change-event';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponseSchema } from '@gen/es/fme/v1/fme_service_pb';
import { WorkflowStepStatus, WorkflowStepStatusChangeEventSchema } from '@gen/es/fme/v1/workflow_pb';
import { EventType } from '@gen/es/fme/v1/events_pb';

const data = {
    runId: 'run-3',
    stepId: 'upload-step',
    status: WorkflowStepStatus.RUNNING,
    timestamp: new Date('2026-10-04T12:10:00.000Z'),
};

describe('WorkflowStepStatusChangeEvent', () => {
    it('should create an instance', () => {
        const evt = new WorkflowStepStatusChangeEvent(data.runId, data.stepId, data.status, data.timestamp);
        expect(evt).toBeTruthy();
        expect(evt.logMessage).toContain(data.stepId);
        expect(evt.logMessage).toContain('RUNNING');
    });

    it('should convert from protobuf', () => {
        const pbEvt = create(ListEventsResponseSchema);
        const evt = create(WorkflowStepStatusChangeEventSchema);
        evt.runId = data.runId;
        evt.stepId = data.stepId;
        evt.status = data.status;
        evt.timestamp = timestampFromDate(data.timestamp);

        pbEvt.eventType = EventType.WORKFLOW_STEP_STATUS_CHANGE_EVENT_TYPE;
        pbEvt.event = {case: 'workflowStepStatusChangeEvent', value: evt};

        const result = WorkflowStepStatusChangeEvent.fromProtobuf(pbEvt);
        expect(result.runId).toBe(data.runId);
        expect(result.stepId).toBe(data.stepId);
        expect(result.status).toBe(WorkflowStepStatus.RUNNING);
        expect(result.timestamp.getTime()).toBe(data.timestamp.getTime());
    });
});
