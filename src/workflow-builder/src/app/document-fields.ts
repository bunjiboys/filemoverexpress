import type { ParameterSpec } from '../workflow/parameters';
import type { WorkflowGraph } from '../workflow/graph';

// Pure helpers behind the document panel (docs section 15): parameter-list edits and
// the defaults text<->object conversion. The panel component only wires Cloudscape
// controls to these, keeping the real logic directly testable.

// Narrow the graph's loosely-typed parameters (unknown[]) to ParameterSpec[] for the
// panel, defaulting an absent list to empty.
export function asParameterList(parameters: WorkflowGraph['parameters']): ParameterSpec[] {
    return (parameters ?? []) as ParameterSpec[];
}

// Append a new string parameter with a generated name that does not collide with an
// existing one (param1, param2, ...).
export function addParameter(parameters: ParameterSpec[]): ParameterSpec[] {
    const taken = new Set(parameters.map((p) => p.name));
    let n = 1;
    while (taken.has(`param${n}`)) {
        n += 1;
    }
    return [...parameters, { name: `param${n}`, type: 'string' }];
}

// Remove the parameter at the given index.
export function removeParameter(parameters: ParameterSpec[], index: number): ParameterSpec[] {
    return parameters.filter((_p, i) => i !== index);
}

// Update fields of the parameter at the given index, leaving the others untouched.
export function patchParameter(
    parameters: ParameterSpec[],
    index: number,
    patch: Partial<ParameterSpec>,
): ParameterSpec[] {
    return parameters.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

// Render spec.defaults as pretty JSON for the defaults text area; undefined shows as
// an empty object.
export function defaultsToText(defaults: WorkflowGraph['defaults']): string {
    return JSON.stringify(defaults ?? {}, null, 4);
}

export type DefaultsParse =
    | { ok: true; value: Record<string, unknown> | undefined }
    | { ok: false; error: string };

// Parse the defaults text area back to an object (or undefined when blank). Rejects
// text that is not a JSON object, so defaults is always a map or cleared.
export function textToDefaults(text: string): DefaultsParse {
    if (text.trim() === '') {
        return { ok: true, value: undefined };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        return { ok: false, error: String(err) };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'defaults must be a JSON object' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
}
