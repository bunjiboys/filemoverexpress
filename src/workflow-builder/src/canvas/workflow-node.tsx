import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from './flow-mapping';

// The custom React Flow node for every step type (docs section 5): a single generic
// shape driven by data.stepType, showing the type and the node's display name, with
// one input (target) and one output (source) port. The port is a dependency handle,
// not typed data flow, so one pair per node is enough. The port side follows the
// layout flow direction's default (left in, right out); React Flow positions the
// wires regardless of the visual side.
export function WorkflowNodeView({ data, selected }: NodeProps): React.JSX.Element {
    const { stepType, name } = data as WorkflowNodeData;
    return (
        <div
            data-selected={selected}
            style={{
                border: `1px solid ${selected ? '#0972d3' : '#8c8c94'}`,
                borderRadius: 8,
                padding: '8px 12px',
                background: 'var(--color-background-container-content, #ffffff)',
                color: 'var(--color-text-body-default, #000716)',
                minWidth: 140,
            }}
        >
            <Handle type="target" position={Position.Left} />
            <div style={{ fontSize: 11, opacity: 0.7 }}>{stepType}</div>
            <div style={{ fontWeight: 700 }}>{name ?? '(unnamed)'}</div>
            <Handle type="source" position={Position.Right} />
        </div>
    );
}
