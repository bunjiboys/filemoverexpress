import { describe, it, expect } from 'vitest';
import { WorkflowRunStatusChangeEvent } from './workflow-run-status-change-event';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponseSchema } from '@gen/es/fme/v1/fme_service_pb';
import { WorkflowRunStatus, WorkflowRunStatusChangeEventSchema } from '@gen/es/fme/v1/workflow_pb';
import { EventType } from '@gen/es/fme/v1/events_pb';

const data = {
    runId: 'run-2',
    status: WorkflowRunStatus.PAUSED,
    timestamp: new Date('2026-10-04T12:05:00.000Z'),
};

describe('WorkflowRunStatusChangeEvent', () => {
    it('should create an instance', () => {
        const evt = new WorkflowRunStatusChangeEvent(data.runId, data.status, data.timestamp);
        expect(evt).toBeTruthy();
        expect(evt.logMessage).toContain('PAUSED');
    });

    it('should convert from protobuf', () => {
        const pbEvt = create(ListEventsResponseSchema);
        const evt = create(WorkflowRunStatusChangeEventSchema);
        evt.runId = data.runId;
        evt.status = data.status;
        evt.timestamp = timestampFromDate(data.timestamp);

        pbEvt.eventType = EventType.WORKFLOW_RUN_STATUS_CHANGE_EVENT_TYPE;
        pbEvt.event = {case: 'workflowRunStatusChangeEvent', value: evt};

        const result = WorkflowRunStatusChangeEvent.fromProtobuf(pbEvt);
        expect(result.runId).toBe(data.runId);
        expect(result.status).toBe(WorkflowRunStatus.PAUSED);
        expect(result.timestamp.getTime()).toBe(data.timestamp.getTime());
    });
});
