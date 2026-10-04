import { BaseEvent, EventLogLevel } from '@app/interfaces/events';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponse } from '@gen/es/fme/v1/fme_service_pb';
import {
    WorkflowRunStatus,
    WorkflowRunCompleteEvent as ProtoWorkflowRunCompleteEvent,
} from '@gen/es/fme/v1/workflow_pb';

export class WorkflowRunCompleteEvent implements BaseEvent {
    logLevel = EventLogLevel.Info;

    constructor(
        public runId: string,
        public name: string,
        public status: WorkflowRunStatus,
        public completed: Date,
    ) {
    }

    get logMessage(): string {
        return `Workflow run ${this.name} completed with status ${WorkflowRunStatus[this.status]}`;
    }

    static fromProtobuf(event: ListEventsResponse): WorkflowRunCompleteEvent {
        const evt = event.event.value as ProtoWorkflowRunCompleteEvent;

        return new WorkflowRunCompleteEvent(
            evt.runId,
            evt.name,
            evt.status,
            evt.completed ? timestampDate(evt.completed) : new Date(),
        );
    }
}
