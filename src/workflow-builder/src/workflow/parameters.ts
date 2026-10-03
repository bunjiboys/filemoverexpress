// A declared workflow parameter, matching the `parameter` payload in
// schemas/workflow/v1.json. Referenced in `with` values as ${params.<name>}.
export type ParameterType = 'string' | 'int' | 'float' | 'bool' | 'enum';

export interface ParameterSpec {
    name: string;
    type: ParameterType;
    required?: boolean;
    default?: unknown;
    pattern?: string; // string only
    min?: number; // int/float only
    max?: number; // int/float only
    values?: string[]; // enum only
}

// Matches a ${params.<name>} reference. The name grammar matches the schema's
// parameter name pattern (^[A-Za-z_][A-Za-z0-9_]*$). Global so a value may carry
// several references.
export const PARAM_REF = /\$\{params\.([A-Za-z_][A-Za-z0-9_]*)\}/g;
