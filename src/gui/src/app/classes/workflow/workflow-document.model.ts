import { WorkflowParameter } from '@app/classes/workflow/workflow-parameter.model';

/**
 * A step as the runner needs it for display: its id, optional human name, and type
 * discriminator. The runner shows a read-only step list; it never edits steps, so this
 * carries only what the "What will run" rail and the confirm summary render. The step
 * `with` payload is not surfaced (the daemon resolves and executes it).
 */
export interface WorkflowStepSummary {
    readonly id: string;
    readonly name?: string;
    readonly type: 'Job' | 'Checksum' | 'Sleep' | 'InventoryReport';
}

/**
 * A parsed, structurally-valid workflow document, reduced to what the runner prompt
 * needs: the workflow name, its declared parameters (the prompt's fields), and a
 * read-only step summary. The schema-driven parse step (a later Phase 2 slice)
 * produces this from the raw file text; the wizard binds to this shape so it is
 * testable without the parser.
 *
 * The raw document text and format are retained verbatim so the runner can submit them
 * to the daemon unchanged (the GUI never produces a resolved document -- runner-GUI doc
 * section 4).
 */
export interface ParsedWorkflowDocument {
    /** The workflow's declared name (metadata.name), or a fallback label when unset. */
    readonly name: string;
    /** The declared parameters, in declaration order -- one prompt field each. */
    readonly parameters: WorkflowParameter[];
    /** The read-only step list for display. */
    readonly steps: WorkflowStepSummary[];
    /** The raw file text, submitted to the daemon unchanged. */
    readonly documentText: string;
    /** How the daemon should parse documentText. */
    readonly format: 'yaml' | 'json';
}
