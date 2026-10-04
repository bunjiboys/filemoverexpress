import { BaseEvent, EventLogLevel } from '@app/interfaces/events';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponse } from '@gen/es/fme/v1/fme_service_pb';
import { WorkflowRunStartedEvent as ProtoWorkflowRunStartedEvent } from '@gen/es/fme/v1/workflow_pb';

export class WorkflowRunStartedEvent implements BaseEvent {
    logLevel = EventLogLevel.Info;

    constructor(
        public runId: string,
        public name: string,
        public started: Date,
    ) {
    }

    get logMessage(): string {
        return `Workflow run ${this.name} started`;
    }

    static fromProtobuf(event: ListEventsResponse): WorkflowRunStartedEvent {
        const evt = event.event.value as ProtoWorkflowRunStartedEvent;

        return new WorkflowRunStartedEvent(
            evt.runId,
            evt.name,
            evt.started ? timestampDate(evt.started) : new Date(),
        );
    }
}
