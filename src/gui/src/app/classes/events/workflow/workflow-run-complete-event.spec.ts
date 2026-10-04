import { describe, it, expect } from 'vitest';
import { WorkflowRunCompleteEvent } from './workflow-run-complete-event';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponseSchema } from '@gen/es/fme/v1/fme_service_pb';
import { WorkflowRunStatus, WorkflowRunCompleteEventSchema } from '@gen/es/fme/v1/workflow_pb';
import { EventType } from '@gen/es/fme/v1/events_pb';

const data = {
    runId: 'run-4',
    name: 'archive-job',
    status: WorkflowRunStatus.SUCCEEDED,
    completed: new Date('2026-10-04T12:20:00.000Z'),
};

describe('WorkflowRunCompleteEvent', () => {
    it('should create an instance', () => {
        const evt = new WorkflowRunCompleteEvent(data.runId, data.name, data.status, data.completed);
        expect(evt).toBeTruthy();
        expect(evt.logMessage).toContain(data.name);
        expect(evt.logMessage).toContain('SUCCEEDED');
    });

    it('should convert from protobuf', () => {
        const pbEvt = create(ListEventsResponseSchema);
        const evt = create(WorkflowRunCompleteEventSchema);
        evt.runId = data.runId;
        evt.name = data.name;
        evt.status = data.status;
        evt.completed = timestampFromDate(data.completed);

        pbEvt.eventType = EventType.WORKFLOW_RUN_COMPLETE_EVENT_TYPE;
        pbEvt.event = {case: 'workflowRunCompleteEvent', value: evt};

        const result = WorkflowRunCompleteEvent.fromProtobuf(pbEvt);
        expect(result.runId).toBe(data.runId);
        expect(result.name).toBe(data.name);
        expect(result.status).toBe(WorkflowRunStatus.SUCCEEDED);
        expect(result.completed.getTime()).toBe(data.completed.getTime());
    });
});
