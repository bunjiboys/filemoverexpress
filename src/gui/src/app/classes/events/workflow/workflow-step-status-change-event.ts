import { BaseEvent, EventLogLevel } from '@app/interfaces/events';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { ListEventsResponse } from '@gen/es/fme/v1/fme_service_pb';
import {
    WorkflowStepStatus,
    WorkflowStepStatusChangeEvent as ProtoWorkflowStepStatusChangeEvent,
} from '@gen/es/fme/v1/workflow_pb';

export class WorkflowStepStatusChangeEvent implements BaseEvent {
    logLevel = EventLogLevel.Info;

    constructor(
        public runId: string,
        public stepId: string,
        public status: WorkflowStepStatus,
        public timestamp: Date,
    ) {
    }

    get logMessage(): string {
        return `Workflow step ${this.stepId} (run ${this.runId}) changed status to ${WorkflowStepStatus[this.status]}`;
    }

    static fromProtobuf(event: ListEventsResponse): WorkflowStepStatusChangeEvent {
        const evt = event.event.value as ProtoWorkflowStepStatusChangeEvent;

        return new WorkflowStepStatusChangeEvent(
            evt.runId,
            evt.stepId,
            evt.status,
            evt.timestamp ? timestampDate(evt.timestamp) : new Date(),
        );
    }
}
