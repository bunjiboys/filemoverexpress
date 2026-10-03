import { WORKFLOW_SCHEMA } from '../schema/loader';
import type { FieldKind, FieldSpec } from './field-spec';

// JSON Schema property node shape (the subset the step payloads use).
interface SchemaProperty {
    type?: string;
    enum?: string[];
    default?: unknown;
    description?: string;
    items?: { type?: string };
}

interface StepDef {
    properties?: Record<string, SchemaProperty>;
    required?: string[];
}

// Derive the form fields for a step type from the bundled schema's <Type>Step $def.
// This is what makes the property modal schema-driven (docs section 2): the form is
// a projection of the same v1.json the daemon validates against, so it never drifts.
export function fieldsForType(type: string): FieldSpec[] {
    const defs = (WORKFLOW_SCHEMA as { $defs: Record<string, StepDef> }).$defs;
    const def = defs[`${type}Step`];
    if (def === undefined) {
        throw new Error(`no schema definition for step type: ${type}`);
    }

    // Every <Type>Step def in the bundled schema declares properties and required;
    // this is guaranteed by v1.json (and the registry/schema lockstep test), so we
    // read them per that contract rather than guarding branches that cannot occur.
    const properties = def.properties as Record<string, SchemaProperty>;
    const required = new Set(def.required as string[]);
    // Object property order in the schema is the field order we present.
    return Object.entries(properties).map(([name, prop]) => toFieldSpec(name, prop, required.has(name)));
}

function toFieldSpec(name: string, prop: SchemaProperty, required: boolean): FieldSpec {
    const spec: FieldSpec = {
        name,
        kind: kindOf(prop),
        required,
    };
    if (prop.description !== undefined) {
        spec.description = prop.description;
    }
    if (prop.enum !== undefined) {
        spec.enumValues = prop.enum;
    }
    if (prop.default !== undefined) {
        spec.default = prop.default;
    }
    return spec;
}

function kindOf(prop: SchemaProperty): FieldKind {
    if (prop.enum !== undefined) {
        return 'enum';
    }
    if (prop.type === 'array') {
        return 'stringList';
    }
    if (prop.type === 'boolean') {
        return 'boolean';
    }
    return 'string';
}
