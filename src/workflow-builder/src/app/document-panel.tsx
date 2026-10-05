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
    defaultToText,
    extraFieldsForType,
    isExtraFieldRequired,
    joinValues,
    parseBound,
    parseDefault,
    patchParameter,
    patchParameterType,
    removeParameter,
    splitValues,
    textToDefaults,
    type ExtraField,
} from './document-fields';

export interface DocumentPanelProps {
    graph: WorkflowGraph;
    onChange: (patch: DocumentPatch) => void;
}

const PARAM_TYPES: ParameterType[] = ['string',
    'int',
    'float',
    'bool',
    'enum',
    'string_array',
    'transfer_profile'];

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
                    <ParameterRow
                        key={index}
                        param={param}
                        index={index}
                        onPatch={(patch) => setParams(patchParameter(params, index, patch))}
                        onType={(type) => setParams(patchParameterType(params, index, type))}
                        onRemove={() => setParams(removeParameter(params, index))}
                    />
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

interface ParameterRowProps {
    param: ParameterSpec;
    index: number;
    onPatch: (patch: Partial<ParameterSpec>) => void;
    onType: (type: ParameterType) => void;
    onRemove: () => void;
}

// Sentinel for the "no default chosen" option in the bool/enum default selects.
const UNSET = '__unset__';

// The "optional" marker shown in a field's info slot (secondary, inactive-colored).
const optionalInfo = <Box variant="span" color="text-status-inactive" fontSize="body-s">optional</Box>;

// One parameter: the name + type + remove line, then the constraint-field editors
// that apply to the chosen type (pattern / min+max / values) and the default. Numeric
// min/max share a single row (BoundsRow); the rest render one per line. A subtle
// bottom border separates each parameter from the next. Changing the type goes through
// onType so stale constraint fields are stripped (patchParameterType).
function ParameterRow({ param, index, onPatch, onType, onRemove }: ParameterRowProps): React.JSX.Element {
    const extras = extraFieldsForType(param.type);
    const hasBounds = extras.includes('min') || extras.includes('max');
    // Render min/max together; everything else keeps its own line.
    const singleExtras = extras.filter((f) => f !== 'min' && f !== 'max');
    return (
        <div style={PARAM_ROW_STYLE}>
            <SpaceBetween size="xs">
                <SpaceBetween direction="horizontal" size="xs">
                    <Input
                        data-testid={`param-name-${index}`}
                        value={param.name}
                        onChange={(e) => onPatch({ name: e.detail.value })}
                    />
                    <Select
                        data-testid={`param-type-${index}`}
                        selectedOption={{ value: param.type, label: param.type }}
                        options={PARAM_TYPES.map((t) => ({ value: t, label: t }))}
                        onChange={(e) => onType(e.detail.selectedOption.value as ParameterType)}
                    />
                    <Button
                        data-testid={`remove-param-${index}`}
                        iconName="remove"
                        variant="icon"
                        ariaLabel={`Remove ${param.name}`}
                        onClick={onRemove}
                    />
                </SpaceBetween>
                {singleExtras.map((field) => (
                    <ExtraFieldControl key={field} field={field} param={param} index={index} onPatch={onPatch} />
                ))}
                {hasBounds && <BoundsRow param={param} index={index} onPatch={onPatch} />}
                <DefaultControl param={param} index={index} onPatch={onPatch} />
            </SpaceBetween>
        </div>
    );
}

// A subtle divider + breathing room between parameter rows. A low-opacity neutral grey
// reads correctly in both the dark and light Cloudscape themes (same approach as the
// split divider), so no theme token dependency is needed.
const PARAM_ROW_STYLE: React.CSSProperties = {
    paddingBottom: 16,
    borderBottom: '1px solid rgba(140, 140, 148, 0.3)',
};

interface BoundsRowProps {
    param: ParameterSpec;
    index: number;
    onPatch: (patch: Partial<ParameterSpec>) => void;
}

// Min and Max on a single row for numeric parameters: these inputs are short and never
// need the full panel width. Each is still an independent, optional field.
function BoundsRow({ param, index, onPatch }: BoundsRowProps): React.JSX.Element {
    return (
        <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <FormField label="Min" info={optionalInfo}>
                    <Input
                        data-testid={`param-min-${index}`}
                        type="number"
                        value={param.min === undefined ? '' : String(param.min)}
                        onChange={(e) => onPatch({ min: parseBound(e.detail.value) })}
                    />
                </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <FormField label="Max" info={optionalInfo}>
                    <Input
                        data-testid={`param-max-${index}`}
                        type="number"
                        value={param.max === undefined ? '' : String(param.max)}
                        onChange={(e) => onPatch({ max: parseBound(e.detail.value) })}
                    />
                </FormField>
            </div>
        </div>
    );
}

interface ExtraFieldControlProps {
    field: ExtraField;
    param: ParameterSpec;
    index: number;
    onPatch: (patch: Partial<ParameterSpec>) => void;
}

// A single constraint-field editor for the one-per-line fields (pattern, values).
// min/max are rendered together by BoundsRow and never reach here. An emptied input
// clears the field (patch to undefined) so the serialized parameter never carries an
// empty string the schema would reject. Optional fields carry an "optional" marker in
// the field's info slot; only enum's `values` is required.
function ExtraFieldControl({ field, param, index, onPatch }: ExtraFieldControlProps): React.JSX.Element {
    const info = isExtraFieldRequired(field)
        ? undefined
        : optionalInfo;

    if (field === 'values') {
        return (
            <FormField label="Values" description="Allowed values, comma-separated.">
                <Input
                    data-testid={`param-values-${index}`}
                    value={joinValues(param.values)}
                    onChange={(e) => onPatch({ values: splitValues(e.detail.value) })}
                />
            </FormField>
        );
    }
    return (
        <FormField label="Pattern" info={info} description="RE2 regex the value must fully match.">
            <Input
                data-testid={`param-pattern-${index}`}
                value={param.pattern ?? ''}
                onChange={(e) => onPatch({ pattern: e.detail.value === '' ? undefined : e.detail.value })}
            />
        </FormField>
    );
}

interface DefaultControlProps {
    param: ParameterSpec;
    index: number;
    onPatch: (patch: Partial<ParameterSpec>) => void;
}

// The per-row default-value editor, shaped to the parameter's type: a bool uses a
// (unset)/true/false select so "no default" stays distinct from a false default; an
// enum uses a select over its declared values plus (unset); int/float use a number
// input; string_array a comma list; string/transfer_profile a text input. The default
// is always optional, so the field carries the optional marker. An emptied control
// clears the default (patchParameterType also clears it on a type change).
function DefaultControl({ param, index, onPatch }: DefaultControlProps): React.JSX.Element {
    const testid = `param-default-${index}`;

    if (param.type === 'bool') {
        const current = param.default === true ? 'true' : param.default === false ? 'false' : UNSET;
        return (
            <FormField label="Default" info={optionalInfo}>
                <Select
                    data-testid={testid}
                    selectedOption={{ value: current, label: current === UNSET ? '(unset)' : current }}
                    options={[{ value: UNSET, label: '(unset)' },
                        { value: 'true', label: 'true' },
                        { value: 'false', label: 'false' }]}
                    onChange={(e) => {
                        const v = e.detail.selectedOption.value;
                        onPatch({ default: v === UNSET ? undefined : v === 'true' });
                    }}
                />
            </FormField>
        );
    }

    if (param.type === 'enum') {
        const values = param.values ?? [];
        const current = typeof param.default === 'string' && values.includes(param.default) ? param.default : UNSET;
        return (
            <FormField label="Default" info={optionalInfo}>
                <Select
                    data-testid={testid}
                    selectedOption={{ value: current, label: current === UNSET ? '(unset)' : current }}
                    options={[{ value: UNSET, label: '(unset)' }, ...values.map((v) => ({ value: v, label: v }))]}
                    onChange={(e) => {
                        const v = e.detail.selectedOption.value;
                        onPatch({ default: v === UNSET ? undefined : v });
                    }}
                />
            </FormField>
        );
    }

    const numeric = param.type === 'int' || param.type === 'float';
    const description = param.type === 'string_array' ? 'Default list, comma-separated.' : undefined;
    return (
        <FormField label="Default" info={optionalInfo} description={description}>
            <Input
                data-testid={testid}
                type={numeric ? 'number' : 'text'}
                value={defaultToText(param.default)}
                onChange={(e) => onPatch({ default: parseDefault(param.type, e.detail.value) })}
            />
        </FormField>
    );
}
