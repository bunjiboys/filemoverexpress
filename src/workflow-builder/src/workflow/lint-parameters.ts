import type { WorkflowGraph } from './graph';
import { PARAM_REF } from './parameters';

// Template-only lint (format doc Parameters section): every ${params.<name>}
// reference appearing in a node `with` value - or in `spec.defaults`, which merges
// into `with` - must name a declared parameter. This is name-lookup only; it does
// not resolve or type-check values (that is resolveParameters' job), it only catches
// references to parameters that do not exist.
export function lintParameterRefs(graph: WorkflowGraph): string[] {
    const declared = new Set((graph.parameters ?? []).map((p) => (p as { name: string }).name));
    const errors: string[] = [];

    const scan = (value: unknown): void => {
        if (typeof value === 'string') {
            for (const match of value.matchAll(PARAM_REF)) {
                const name = match[1];
                if (!declared.has(name)) {
                    errors.push(`undeclared parameter: ${name}`);
                }
            }
        } else if (Array.isArray(value)) {
            for (const item of value) {
                scan(item);
            }
        } else if (value !== null && typeof value === 'object') {
            for (const v of Object.values(value)) {
                scan(v);
            }
        }
    };

    for (const node of graph.nodes) {
        scan(node.with);
    }
    scan(graph.defaults);

    return errors;
}
