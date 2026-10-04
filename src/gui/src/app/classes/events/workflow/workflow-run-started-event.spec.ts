import { describe, it, expect } from 'vitest';
import { WorkflowRunStartedEvent } from './workflow-run-started-event';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponseSchema } from '@gen/es/fme/v1/fme_service_pb';
import { WorkflowRunStartedEventSchema } from '@gen/es/fme/v1/workflow_pb';
import { EventType } from '@gen/es/fme/v1/events_pb';

const data = {
    runId: 'run-1',
    name: 'nightly-sync',
    started: new Date('2026-10-04T12:00:00.000Z'),
};

describe('WorkflowRunStartedEvent', () => {
    it('should create an instance', () => {
        const evt = new WorkflowRunStartedEvent(data.runId, data.name, data.started);
        expect(evt).toBeTruthy();
        expect(evt.logMessage).toContain(data.name);
    });

    it('should convert from protobuf', () => {
        const pbEvt = create(ListEventsResponseSchema);
        const evt = create(WorkflowRunStartedEventSchema);
        evt.runId = data.runId;
        evt.name = data.name;
        evt.started = timestampFromDate(data.started);

        pbEvt.eventType = EventType.WORKFLOW_RUN_STARTED_EVENT_TYPE;
        pbEvt.event = {case: 'workflowRunStartedEvent', value: evt};

        const result = WorkflowRunStartedEvent.fromProtobuf(pbEvt);
        expect(result.runId).toBe(data.runId);
        expect(result.name).toBe(data.name);
        expect(result.started.getTime()).toBe(data.started.getTime());
    });

    it('should default started to now when the timestamp is absent', () => {
        const pbEvt = create(ListEventsResponseSchema);
        const evt = create(WorkflowRunStartedEventSchema);
        evt.runId = data.runId;
        evt.name = data.name;
        pbEvt.event = {case: 'workflowRunStartedEvent', value: evt};

        const result = WorkflowRunStartedEvent.fromProtobuf(pbEvt);
        expect(result.started).toBeInstanceOf(Date);
    });
});
