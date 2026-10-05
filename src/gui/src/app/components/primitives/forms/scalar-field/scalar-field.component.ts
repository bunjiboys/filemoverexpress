import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatOption, MatSelect } from '@angular/material/select';
import {
    initialFieldValue,
    isFieldOverridden,
    validateField,
} from '@app/classes/workflow/workflow-parameter-field';
import {
    isEffectivelyRequired,
    WorkflowParameter,
} from '@app/classes/workflow/workflow-parameter.model';

/**
 * The editor for a scalar workflow parameter (string / int / float / bool / enum /
 * transfer_profile), per the runner-GUI doc field-composition table. One component drives
 * all scalar controls, dispatching on the parameter type:
 *
 * - string           -> text input (pattern full-match)
 * - int              -> number input, step 1 (integer, inclusive min/max)
 * - float            -> number input, step any (number, inclusive min/max)
 * - bool             -> checkbox toggle (submits "true"/"false")
 * - enum             -> native select over the parameter's declared `values`
 * - transfer_profile -> native select over the daemon's live transfer profiles (passed in
 *   via `transferProfiles`), submitting the chosen profile name; replaces the hardcoded
 *   enum approach for selecting a transfer profile
 *
 * The field surfaces client pre-flight validation and an override badge with revert,
 * all derived from the shared field model. The value is held by the host and updated
 * through `valueChange`; the GUI never coerces -- it submits the user's text and the
 * daemon owns coercion (and, for transfer_profile, authoritative profile existence).
 */
@Component({
    selector: 'fme-scalar-field',
    templateUrl: './scalar-field.component.html',
    styleUrls: ['./scalar-field.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        FormsModule,
        MatButton,
        MatFormField,
        MatInput,
        MatSlideToggle,
        MatSelect,
        MatOption,
    ],
})
export class ScalarFieldComponent {
    /** The parameter being edited (type, required, default, constraints). */
    parameter = input.required<WorkflowParameter>();
    /** The current value as a string (uncoerced). Host-owned; updated via valueChange. */
    value = input.required<string>();
    /**
     * The daemon's live transfer-profile names, for a `transfer_profile` parameter's
     * dropdown. Supplied by the host (which reads TransferProfileService); empty for every
     * other type and when no daemon is connected.
     */
    transferProfiles = input<readonly string[]>([]);

    /** Emits the new value string whenever the control changes or is reverted. */
    valueChange = output<string>();

    /** Client pre-flight validation message for the current value, or null when valid. */
    protected readonly error = computed<string | null>(() =>
        validateField(this.parameter(), this.value()),
    );

    /** Whether the current value differs from the file's declared default. */
    protected readonly overridden = computed<boolean>(() =>
        isFieldOverridden(this.parameter(), this.value()),
    );

    /** Whether the field must be supplied (drives the required marker). */
    protected readonly required = computed<boolean>(() => isEffectivelyRequired(this.parameter()));

    /** The step attribute for a numeric input: integer for int, any for float. */
    protected readonly numberStep = computed<string>(() => (this.parameter().type === 'int' ? '1' : 'any'));

    /** The allowed enum values (empty for a non-enum). */
    protected readonly enumValues = computed<string[]>(() => this.parameter().values ?? []);

    /** The live transfer-profile options for a transfer_profile parameter (empty otherwise). */
    protected readonly profileOptions = computed<readonly string[]>(() => this.transferProfiles());

    /** The current bool value as a checkbox state. */
    checked(): boolean {
        return this.value() === 'true';
    }

    /** Emit a text/number value from a text or number input. */
    onText(next: string): void {
        this.valueChange.emit(next);
    }

    /** Emit the canonical "true"/"false" string from a checkbox toggle. */
    onToggle(checked: boolean): void {
        this.valueChange.emit(checked ? 'true' : 'false');
    }

    /** Revert the field to the file's declared default (or empty when none). */
    revert(): void {
        this.valueChange.emit(initialFieldValue(this.parameter()) as string);
    }
}
