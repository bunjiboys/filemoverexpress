import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
    initialFieldValue,
    isFieldOverridden,
    validateField,
} from '@app/classes/workflow/workflow-parameter-field';
import { WorkflowParameter } from '@app/classes/workflow/workflow-parameter.model';

/**
 * The editor for a `string_array` workflow parameter: a multi-chip input with a Browse
 * button (runner-GUI doc "The string_array field and Browse"). Each selected path is a
 * removable chip; the user may also type a path directly. The field surfaces client
 * pre-flight validation (element-wise pattern, required = at least one element) and an
 * override badge with revert, all derived from the shared field model.
 *
 * This is a DUMB primitive: it owns the chip list and entry box, but it does NOT open
 * the File Browser itself. Clicking Browse emits `browseRequested`; the host opens the
 * `fme-file-browser` modal in pick-mode and feeds the chosen paths back by updating the
 * `values` input. This keeps the heavy daemon-connected browser wiring out of the field.
 */
@Component({
    selector: 'fme-string-array-field',
    templateUrl: './string-array-field.component.html',
    styleUrls: ['./string-array-field.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        FormsModule,
        MatIcon,
        MatTooltip,
    ],
})
export class StringArrayFieldComponent {
    /** The parameter being edited (type, required, default, pattern). */
    parameter = input.required<WorkflowParameter>();
    /** The current ordered list of values (chips). Host-owned; updated via valuesChange. */
    values = input.required<string[]>();

    /** Emits the new ordered value list whenever a chip is added, removed, or reverted. */
    valuesChange = output<string[]>();
    /** Emits when the user clicks Browse; the host opens the file-browser modal. */
    browseRequested = output<void>();

    /** The in-progress text in the add-a-path entry box. */
    entry = '';

    /** Client pre-flight validation message for the current value, or null when valid. */
    protected readonly error = computed<string | null>(() =>
        validateField(this.parameter(), this.values()),
    );

    /** Whether the current value differs from the file's declared default. */
    protected readonly overridden = computed<boolean>(() =>
        isFieldOverridden(this.parameter(), this.values()),
    );

    /** Whether the field must be supplied (drives the required marker). */
    protected readonly required = computed<boolean>(() => this.parameter().required);

    /** The leaf name of a path for the chip label (handles both / and \ separators). */
    protected leafName(path: string): string {
        const trimmed = path.replace(/[/\\]+$/, '');
        const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
    }

    /** Remove the chip at the given index and emit the remaining values. */
    protected removeAt(index: number): void {
        const next = this.values().filter((_, i) => i !== index);
        this.valuesChange.emit(next);
    }

    /**
     * Add the trimmed entry as a new chip when it is non-empty and not already present,
     * then clear the entry box. A blank or duplicate entry is ignored.
     */
    addEntry(): void {
        const trimmed = this.entry.trim();
        if (trimmed.length === 0 || this.values().includes(trimmed)) {
            return;
        }

        this.valuesChange.emit([...this.values(), trimmed]);
        this.entry = '';
    }

    /** Revert the field to the file's declared default (or empty when none). */
    revert(): void {
        this.valuesChange.emit(initialFieldValue(this.parameter()) as string[]);
    }

    /** Signal the host to open the file-browser modal in pick-mode. */
    protected browse(): void {
        this.browseRequested.emit();
    }
}
