import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { ScalarFieldComponent } from '@primitives/forms/scalar-field/scalar-field.component';
import { StringArrayFieldComponent } from '@primitives/forms/string-array-field/string-array-field.component';
import {
    initialFieldValue,
    isFieldOverridden,
    toParamSubmission,
    validateField,
    WorkflowFieldValue,
    WorkflowParamSubmission,
} from '@app/classes/workflow/workflow-parameter-field';
import { isArrayParameter, WorkflowParameter } from '@app/classes/workflow/workflow-parameter.model';
import { ParsedWorkflowDocument } from '@app/classes/workflow/workflow-document.model';

/** The step the wizard is currently on. Open is completed before the wizard renders. */
export type WizardStep = 'parameters' | 'confirm';

/** The payload the wizard emits on Run / Validate -- fed straight to the fme-client RPCs. */
export interface WorkflowRunSubmission {
    documentText: string;
    format: 'yaml' | 'json';
    params: WorkflowParamSubmission[];
}

/**
 * The workflow runner wizard shell (runner-GUI doc sections 3 and 6, and the agreed
 * Phase 2 "wizard + live summary" visual spec). It hosts the parameter fields and walks
 * the user Open -> Parameters -> Confirm:
 *
 * - The Parameters step is a split: the field form on the left (one scalar or
 *   string_array field per declared parameter) and a persistent "What will run" rail on
 *   the right (name, step count, live params-set count, per-parameter resolved values
 *   with an overridden flag, and the read-only step list).
 * - Next -> Confirm is gated: it is disabled while any field fails client validation, so
 *   the guided flow cannot advance with bad input.
 * - The Confirm step drops the form and shows the resolved summary before Run.
 *
 * The wizard owns the per-field values but not file opening or submission transport: the
 * host passes a parsed document and handles the emitted runRequested / validateRequested.
 */
@Component({
    selector: 'fme-workflow-runner-wizard',
    templateUrl: './workflow-runner-wizard.component.html',
    styleUrls: ['./workflow-runner-wizard.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        ScalarFieldComponent,
        StringArrayFieldComponent,
        MatButton,
    ],
})
export class WorkflowRunnerWizardComponent {
    /** The parsed, structurally-valid workflow to run. */
    document = input.required<ParsedWorkflowDocument>();

    /** Emits when the user confirms Run; the host calls RunWorkflow. */
    runRequested = output<WorkflowRunSubmission>();
    /** Emits when the user clicks Validate; the host calls ValidateWorkflow. */
    validateRequested = output<WorkflowRunSubmission>();
    /** Emits a string_array parameter's name when its Browse button is clicked. */
    browseRequested = output<string>();

    /** The current wizard step. */
    readonly step = signal<WizardStep>('parameters');

    /** Per-parameter current values, keyed by parameter name. */
    private readonly fieldValues = signal<Map<string, WorkflowFieldValue>>(new Map());

    /** The declared parameters in order. */
    protected readonly parameters = computed<WorkflowParameter[]>(() => this.document().parameters);

    /** True when every field passes client-side pre-flight validation. */
    readonly ready = computed<boolean>(() =>
        this.parameters().every((p) => validateField(p, this.currentValue(p)) === null),
    );

    /** Count of parameters with a non-empty value (for the rail's "params set" line). */
    readonly paramsSetCount = computed<number>(() =>
        this.parameters().filter((p) => !this.isEmpty(this.currentValue(p))).length,
    );

    constructor() {
        // Seed field values from file defaults whenever the document changes, and set the
        // initial step: a parameterless workflow skips straight to confirm.
        effect(() => {
            const d = this.document();
            const seeded = new Map<string, WorkflowFieldValue>();
            for (const p of d.parameters) {
                seeded.set(p.name, initialFieldValue(p));
            }
            this.fieldValues.set(seeded);
            this.step.set(d.parameters.length === 0 ? 'confirm' : 'parameters');
        });
    }

    /** The current value for a parameter, falling back to its seeded default. */
    private currentValue(param: WorkflowParameter): WorkflowFieldValue {
        const v = this.fieldValues().get(param.name);
        return v !== undefined ? v : initialFieldValue(param);
    }

    /** Public reader for templates/tests: the current value of a named parameter. */
    valueOf(name: string): WorkflowFieldValue {
        const param = this.parameters().find((p) => p.name === name);
        return param ? this.currentValue(param) : '';
    }

    /** Whether a field value is empty (empty string or empty array). */
    private isEmpty(value: WorkflowFieldValue): boolean {
        return Array.isArray(value) ? value.length === 0 : value === '';
    }

    /** Whether a parameter is a string_array (selects which field component to render). */
    protected isArray(param: WorkflowParameter): boolean {
        return isArrayParameter(param);
    }

    /** Narrow a field value to a scalar string for the scalar field binding. */
    protected asScalar(value: WorkflowFieldValue): string {
        /* c8 ignore next -- justified-unreachable: the template routes array params to the
           array field via isArray(), so a scalar binding never receives a string[]. */
        return typeof value === 'string' ? value : '';
    }

    /** Narrow a field value to a string[] for the array field binding. */
    protected asArray(value: WorkflowFieldValue): string[] {
        /* c8 ignore next -- justified-unreachable: the template routes scalar params to the
           scalar field, so an array binding never receives a plain string. */
        return Array.isArray(value) ? value : [];
    }

    /** Whether a parameter's current value overrides its file default (for the rail). */
    protected isOverridden(param: WorkflowParameter): boolean {
        return isFieldOverridden(param, this.currentValue(param));
    }

    /** The resolved display value for the rail (comma-joined for arrays). */
    protected displayValue(param: WorkflowParameter): string {
        const v = this.currentValue(param);
        return Array.isArray(v) ? v.join(', ') : v;
    }

    /** Update one field's value. */
    setValue(name: string, value: WorkflowFieldValue): void {
        const next = new Map(this.fieldValues());
        next.set(name, value);
        this.fieldValues.set(next);
    }

    /** Relay a string_array field's Browse click up to the host (which opens the picker). */
    onBrowse(name: string): void {
        this.browseRequested.emit(name);
    }

    /**
     * Append picked paths to a string_array field, de-duplicating against existing values.
     * Called by the host after the source picker returns a selection.
     */
    appendValues(name: string, paths: string[]): void {
        const current = this.asArray(this.valueOf(name));
        const merged = [...current];
        for (const p of paths) {
            if (!merged.includes(p)) {
                merged.push(p);
            }
        }
        this.setValue(name, merged);
    }

    /** Advance to the confirm step when ready. */
    next(): void {
        if (this.ready()) {
            this.step.set('confirm');
        }
    }

    /** Return to the parameters step. */
    back(): void {
        this.step.set('parameters');
    }

    /** Build the submission params from the current field values. */
    buildSubmission(): WorkflowParamSubmission[] {
        return this.parameters().map((p) => toParamSubmission(p, this.currentValue(p)));
    }

    /** Assemble the full run/validate payload. */
    private submission(): WorkflowRunSubmission {
        return {
            documentText: this.document().documentText,
            format: this.document().format,
            params: this.buildSubmission(),
        };
    }

    /** Emit a Run request with the assembled payload. */
    run(): void {
        this.runRequested.emit(this.submission());
    }

    /** Emit a Validate request with the assembled payload. */
    validate(): void {
        this.validateRequested.emit(this.submission());
    }
}
