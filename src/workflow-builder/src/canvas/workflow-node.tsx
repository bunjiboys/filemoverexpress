import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from './flow-mapping';
import { surfaceColors, UI_FONT_FAMILY } from './theme';

// The custom React Flow node for every step type (docs section 5): a single generic
// shape driven by data.stepType, showing the type and the node's display name, with
// one input (target) and one output (source) port. It themes itself from
// data.colorMode (via surfaceColors) because Cloudscape's container CSS variables do
// not resolve inside React Flow's DOM, which left nodes white in dark mode. The port
// is a dependency handle, not typed data flow, so one pair per node is enough.
export function WorkflowNodeView({ data, selected }: NodeProps): React.JSX.Element {
    const { stepType, name, colorMode } = data as WorkflowNodeData;
    const colors = surfaceColors(colorMode);
    return (
        <div
            data-selected={selected}
            style={{
                border: `1px solid ${selected ? '#0972d3' : colors.border}`,
                borderRadius: 8,
                padding: '8px 12px',
                background: colors.background,
                color: colors.text,
                fontFamily: UI_FONT_FAMILY,
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
