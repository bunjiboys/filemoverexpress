import { BaseEvent, EventLogLevel } from '@app/interfaces/events';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponse } from '@gen/es/fme/v1/fme_service_pb';
import {
    WorkflowRunStatus,
    WorkflowRunStatusChangeEvent as ProtoWorkflowRunStatusChangeEvent,
} from '@gen/es/fme/v1/workflow_pb';

export class WorkflowRunStatusChangeEvent implements BaseEvent {
    logLevel = EventLogLevel.Info;

    constructor(
        public runId: string,
        public status: WorkflowRunStatus,
        public timestamp: Date,
    ) {
    }

    get logMessage(): string {
        return `Workflow run ${this.runId} changed status to ${WorkflowRunStatus[this.status]}`;
    }

    static fromProtobuf(event: ListEventsResponse): WorkflowRunStatusChangeEvent {
        const evt = event.event.value as ProtoWorkflowRunStatusChangeEvent;

        return new WorkflowRunStatusChangeEvent(
            evt.runId,
            evt.status,
            evt.timestamp ? timestampDate(evt.timestamp) : new Date(),
        );
    }
}
