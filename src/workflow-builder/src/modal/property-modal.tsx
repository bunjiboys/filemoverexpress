import { useState } from 'react';
import Modal from '@cloudscape-design/components/modal';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { PropertyForm } from './property-form';
import type { WorkflowNode } from '../nodes/descriptor';
import type { NodePatch } from '../canvas/graph-mutations';

export interface PropertyModalProps {
    // The node being edited, or null when the modal is closed.
    node: WorkflowNode | null;
    onSave: (id: string, patch: NodePatch) => void;
    onDelete: (id: string) => void;
    onDismiss: () => void;
}

// The property editor that opens on a node double-click (docs section 2). It edits the
// node's display name and its schema-driven `with` payload (via the already-tested
// PropertyForm) and offers delete. The editing body and footer only mount with a
// concrete node, keyed by id so the draft reseeds per node, which means the save/delete
// handlers close over a known node and never need a null guard.
export function PropertyModal({ node, onSave, onDelete, onDismiss }: PropertyModalProps): React.JSX.Element {
    return (
        <Modal
            visible={node !== null}
            onDismiss={onDismiss}
            header={node !== null ? `Edit ${node.type} step` : ''}
        >
            {node !== null && (
                <ModalContent
                    key={node.id}
                    node={node}
                    onSave={onSave}
                    onDelete={onDelete}
                    onDismiss={onDismiss}
                />
            )}
        </Modal>
    );
}

// The editing UI for a concrete node. Mounted fresh per node id (via the key above),
// so its draft state starts from that node and never leaks between nodes; edits are
// committed only on Save. The footer actions live here because they operate on the
// draft the body owns.
function ModalContent({ node, onSave, onDelete, onDismiss }: {
    node: WorkflowNode;
    onSave: (id: string, patch: NodePatch) => void;
    onDelete: (id: string) => void;
    onDismiss: () => void;
}): React.JSX.Element {
    const [name, setName] = useState(node.name ?? '');
    const [payload, setPayload] = useState<Record<string, unknown>>(node.with);

    return (
        <SpaceBetween size="m">
            <FormField label="name">
                <Input data-testid="node-name" value={name} onChange={(e) => setName(e.detail.value)} />
            </FormField>
            <PropertyForm type={node.type} value={payload} onChange={setPayload} />
            <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                    <Button data-testid="modal-delete" iconName="remove" onClick={() => onDelete(node.id)}>
                        Delete step
                    </Button>
                    <Button data-testid="modal-cancel" onClick={onDismiss}>
                        Cancel
                    </Button>
                    <Button
                        data-testid="modal-save"
                        variant="primary"
                        onClick={() => onSave(node.id, { name, with: payload })}
                    >
                        Save
                    </Button>
                </SpaceBetween>
            </Box>
        </SpaceBetween>
    );
}
