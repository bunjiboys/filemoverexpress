import { describe, it, expect } from 'vitest';
import { lintParameterRefs } from './lint-parameters';
import type { WorkflowGraph } from './graph';
import type { ParameterSpec } from './parameters';

const graph = (
    withValues: Record<string, unknown>,
    parameters: ParameterSpec[] = [],
    defaults?: Record<string, unknown>,
): WorkflowGraph => ({
    nodes: [{ id: 'a', type: 'Job', with: withValues, continueOnError: false }],
    edges: [],
    parameters,
    defaults,
});

// Template-only lint (format doc Parameters): every ${params.x} used in a `with`
// value (or in defaults, which merge into `with`) must reference a declared
// parameter. Name-lookup only - no expressions.
describe('lintParameterRefs', () => {
    it('passes when every reference resolves to a declared parameter', () => {
        const g = graph(
            { destination: 'shows/${params.show}/day-${params.day}' },
            [{ name: 'show', type: 'string' }, { name: 'day', type: 'string' }],
        );
        expect(lintParameterRefs(g)).toEqual([]);
    });

    it('flags a reference to an undeclared parameter', () => {
        const g = graph({ destination: 'shows/${params.ghost}' }, [{ name: 'show', type: 'string' }]);
        const errors = lintParameterRefs(g);
        expect(errors.some((e) => /undeclared parameter: ghost/i.test(e))).toBe(true);
    });

    it('finds references nested inside arrays and objects', () => {
        const g = graph(
            { sources: ['/vol/${params.card}'], opts: { tag: '${params.tag}' } },
            [{ name: 'card', type: 'string' }],
        );
        const errors = lintParameterRefs(g);
        expect(errors.some((e) => /undeclared parameter: tag/i.test(e))).toBe(true);
        expect(errors.some((e) => /card/i.test(e))).toBe(false);
    });

    it('lints references in defaults too', () => {
        const g = graph({ destination: 'x' }, [{ name: 'show', type: 'string' }], { base: '${params.ghost}' });
        const errors = lintParameterRefs(g);
        expect(errors.some((e) => /undeclared parameter: ghost/i.test(e))).toBe(true);
    });

    it('passes a graph with no parameter references', () => {
        expect(lintParameterRefs(graph({ destination: 'static/path' }))).toEqual([]);
    });

    it('flags any reference when no parameters are declared at all', () => {
        const g: WorkflowGraph = {
            nodes: [{ id: 'a', type: 'Job', with: { d: '${params.x}' }, continueOnError: false }],
            edges: [],
        };
        expect(lintParameterRefs(g).some((e) => /undeclared parameter: x/i.test(e))).toBe(true);
    });
});
