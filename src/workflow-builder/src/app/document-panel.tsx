import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import type { DocumentPatch } from '../canvas/graph-mutations';
import type { WorkflowGraph } from '../workflow/graph';
import type { ParameterSpec, ParameterType } from '../workflow/parameters';
import {
    addParameter,
    asParameterList,
    defaultsToText,
    patchParameter,
    removeParameter,
    textToDefaults,
} from './document-fields';

export interface DocumentPanelProps {
    graph: WorkflowGraph;
    onChange: (patch: DocumentPatch) => void;
}

const PARAM_TYPES: ParameterType[] = ['string',
    'int',
    'float',
    'bool',
    'enum'];

// The document panel (docs section 15): edits the workflow-level fields that are not
// per-node - metadata (name/description), parameters, and defaults. Controlled: each
// edit emits a DocumentPatch to the parent (the controller's setDocument). The panel
// is thin - the array edits and defaults parsing live in document-fields; a defaults
// edit that is not valid JSON is simply not committed (the text area keeps the user's
// in-progress value since the parent model is unchanged).
export function DocumentPanel({ graph, onChange }: DocumentPanelProps): React.JSX.Element {
    const name = graph.metadata?.name ?? '';
    const description = graph.metadata?.description ?? '';
    const params = asParameterList(graph.parameters);

    const setMetadata = (patch: { name?: string; description?: string }): void => {
        onChange({ metadata: { ...graph.metadata, name, description, ...patch } });
    };
    const setParams = (next: ParameterSpec[]): void => onChange({ parameters: next });

    return (
        <SpaceBetween size="l">
            <SpaceBetween size="s">
                <Box variant="h3">Metadata</Box>
                <FormField label="Name">
                    <Input
                        data-testid="meta-name"
                        value={name}
                        onChange={(e) => setMetadata({ name: e.detail.value })}
                    />
                </FormField>
                <FormField label="Description">
                    <Textarea
                        data-testid="meta-description"
                        value={description}
                        onChange={(e) => setMetadata({ description: e.detail.value })}
                    />
                </FormField>
            </SpaceBetween>

            <SpaceBetween size="s">
                <Box variant="h3">Parameters</Box>
                {params.map((param, index) => (
                    <SpaceBetween key={index} direction="horizontal" size="xs">
                        <Input
                            data-testid={`param-name-${index}`}
                            value={param.name}
                            onChange={(e) => setParams(patchParameter(params, index, { name: e.detail.value }))}
                        />
                        <Select
                            data-testid={`param-type-${index}`}
                            selectedOption={{ value: param.type, label: param.type }}
                            options={PARAM_TYPES.map((t) => ({ value: t, label: t }))}
                            onChange={(e) =>
                                setParams(patchParameter(params, index, { type: e.detail.selectedOption.value as ParameterType }))}
                        />
                        <Button
                            data-testid={`remove-param-${index}`}
                            iconName="remove"
                            variant="icon"
                            ariaLabel={`Remove ${param.name}`}
                            onClick={() => setParams(removeParameter(params, index))}
                        />
                    </SpaceBetween>
                ))}
                <Button data-testid="add-param" iconName="add-plus" onClick={() => setParams(addParameter(params))}>
                    Add parameter
                </Button>
            </SpaceBetween>

            <SpaceBetween size="s">
                <Box variant="h3">Defaults</Box>
                <FormField label="Defaults (JSON)" description="Merged into every step's configuration.">
                    <Textarea
                        data-testid="defaults"
                        value={defaultsToText(graph.defaults)}
                        onChange={(e) => {
                            const parsed = textToDefaults(e.detail.value);
                            if (parsed.ok) {
                                onChange({ defaults: parsed.value });
                            }
                        }}
                    />
                </FormField>
            </SpaceBetween>
        </SpaceBetween>
    );
}
