import { ChangeDetectionStrategy, Component, computed, inject, output, signal, ViewChild } from '@angular/core';
import { MatDialog, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { WailsService } from '@services/wails/wails.service';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import {
    WorkflowFormat,
    WorkflowValidationError,
    WorkflowValidationErrorKind,
} from '@gen/es/fme/v1/workflow_pb';
import { parseWorkflowDocument } from '@app/classes/workflow/workflow-parse';
import { ParsedWorkflowDocument } from '@app/classes/workflow/workflow-document.model';
import {
    WorkflowRunnerWizardComponent,
    WorkflowRunSubmission,
} from '@app/components/layout/workflow-runner-wizard/workflow-runner-wizard.component';
import {
    WorkflowSourcePickerData,
    WorkflowSourcePickerModalComponent,
} from '@app/components/modals/workflow-source-picker-modal/workflow-source-picker-modal.component';

/** Per-parameter field errors, keyed by parameter name (from PARAMETER-kind daemon errors). */
type FieldErrors = Record<string, string>;

/**
 * The workflow runner host (runner-GUI doc section 6). It threads the whole flow
 * together: open a file -> read its text -> parse + structurally validate -> hand the
 * parsed document to the wizard -> submit the wizard's Run/Validate to the daemon,
 * routing daemon validation errors back to the offending field (PARAMETER) or a
 * document-level banner (SCHEMA/GRAPH/PROFILE/VERSION).
 *
 * It owns transport and file IO; the wizard owns the parameter values. The GUI never
 * resolves ${params.*} -- it submits {documentText, format, params} and the daemon
 * resolves, validates fail-fast, and runs.
 */
@Component({
    selector: 'fme-workflow-runner',
    templateUrl: './workflow-runner.component.html',
    styleUrls: ['./workflow-runner.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        WorkflowRunnerWizardComponent,
        MatDialogTitle,
        MatDialogContent,
        MatDialogClose,
        MatIcon,
        MatIconButton,
    ],
})
export class WorkflowRunnerComponent {
    private wails = inject(WailsService);
    private fmeClient = inject(FmeClientService);
    private dialog = inject(MatDialog);

    /** The embedded wizard, so a source-picker result can be fed back into a field. */
    @ViewChild(WorkflowRunnerWizardComponent) wizard?: WorkflowRunnerWizardComponent;

    /** Emits the run id when a run is accepted, so the host view can scope the jobs view. */
    runStarted = output<string>();

    /** The parsed workflow being run, or null before a file is opened. */
    readonly document = signal<ParsedWorkflowDocument | null>(null);
    /** A document-level error (parse failure or non-parameter daemon error), or null. */
    readonly documentError = signal<string | null>(null);
    /** Per-parameter daemon errors to surface on the fields. */
    readonly fieldErrors = signal<FieldErrors>({});
    /** True after an explicit Validate returned clean. */
    readonly validationPassed = signal<boolean>(false);

    /** Array view of fieldErrors for the template's error summary. */
    readonly fieldErrorList = computed<{name: string; message: string}[]>(() =>
        Object.entries(this.fieldErrors()).map(([name, message]) => ({name, message})),
    );

    /** Open a workflow file, read it, parse it, and hand it to the wizard. */
    openWorkflow(): void {
        this.wails.openFile('Open a workflow file', '', 'Workflow files', '*.yaml;*.yml;*.json')
            .subscribe((path) => {
                if (!path) {
                    return;
                }
                this.loadFromPath(path);
            });
    }

    /** Read and parse the file at the chosen path. */
    private loadFromPath(path: string): void {
        this.wails.readTextFile(path).subscribe({
            next: (text) => this.parseAndSet(text, formatForPath(path)),
            error: (err: unknown) => this.failDocument(errorText(err)),
        });
    }

    /** Parse the text; on success open the wizard, on failure show the error. */
    private parseAndSet(text: string, format: 'yaml' | 'json'): void {
        const result = parseWorkflowDocument(text, format);
        if (!result.ok) {
            this.failDocument(result.error.message);
            return;
        }
        this.resetErrors();
        this.document.set(result.document);
    }

    /** Handle the wizard's Run request. */
    onRun(submission: WorkflowRunSubmission): void {
        this.resetErrors();
        this.fmeClient.runWorkflow(submission.documentText, toFormat(submission.format), submission.params)
            .subscribe({
                next: (res) => {
                    if (res.accepted) {
                        this.runStarted.emit(res.runId);
                        return;
                    }
                    this.routeErrors(res.errors);
                },
                error: (err: unknown) => this.failDocument(errorText(err)),
            });
    }

    /** Handle the wizard's Validate request. */
    onValidate(submission: WorkflowRunSubmission): void {
        this.resetErrors();
        this.fmeClient.validateWorkflow(submission.documentText, toFormat(submission.format), submission.params)
            .subscribe({
                next: (res) => {
                    if (res.valid) {
                        this.validationPassed.set(true);
                        return;
                    }
                    this.routeErrors(res.errors);
                },
                error: (err: unknown) => this.failDocument(errorText(err)),
            });
    }

    /**
     * Open the source-picker modal in response to a string_array field's Browse click, and
     * feed the chosen paths back into that field via the wizard. The picker is select-only
     * (pick mode); it returns the chosen paths or undefined on cancel.
     */
    onBrowse(parameterName: string): void {
        const data: WorkflowSourcePickerData = {initialDirectory: '/'};
        this.dialog.open<WorkflowSourcePickerModalComponent, WorkflowSourcePickerData, string[] | undefined>(
            WorkflowSourcePickerModalComponent,
            {data, width: '70%', maxWidth: '820px', panelClass: 'settings-dialog'},
        ).afterClosed().subscribe((paths) => {
            if (paths && paths.length > 0) {
                this.wizard?.appendValues(parameterName, paths);
            }
        });
    }

    /** Route daemon validation errors: PARAMETER -> field, everything else -> banner. */
    private routeErrors(errors: WorkflowValidationError[]): void {
        const fields: FieldErrors = {};
        const docMessages: string[] = [];
        for (const e of errors) {
            if (e.kind === WorkflowValidationErrorKind.PARAMETER && e.parameter) {
                fields[e.parameter] = e.message;
            } else {
                docMessages.push(e.message);
            }
        }
        this.fieldErrors.set(fields);
        this.documentError.set(docMessages.length > 0 ? docMessages.join('; ') : null);
    }

    /** Set a document-level error and clear any open document. */
    private failDocument(message: string): void {
        this.document.set(null);
        this.fieldErrors.set({});
        this.validationPassed.set(false);
        this.documentError.set(message);
    }

    /** Clear all error + validation state. */
    private resetErrors(): void {
        this.documentError.set(null);
        this.fieldErrors.set({});
        this.validationPassed.set(false);
    }
}

/** Infer the parse format from a file path's extension (.json -> json, else yaml). */
function formatForPath(path: string): 'yaml' | 'json' {
    const dot = path.lastIndexOf('.');
    const ext = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
    return ext === 'json' ? 'json' : 'yaml';
}

/** Map the parsed-document format to the protobuf WorkflowFormat enum. */
function toFormat(format: 'yaml' | 'json'): WorkflowFormat {
    return format === 'json' ? WorkflowFormat.JSON : WorkflowFormat.YAML;
}

/** Extract a human-readable message from a thrown value. */
function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
