import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { WailsService } from '@services/wails/wails.service';
import { FmeClientService } from '@services/fme-client/fme-client.service';
import { WorkflowFormat, WorkflowValidationErrorKind } from '@gen/es/fme/v1/workflow_pb';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowRunnerComponent } from './workflow-runner.component';

const validYaml = `apiVersion: fme.dev/workflow/v1
kind: Workflow
metadata:
  name: nightly-media-sync
spec:
  parameters:
    - name: bucket
      type: string
      required: true
  steps:
    - id: ingest
      type: Job
      with:
        direction: upload
        transferProfile: prod
        sources: ["\${params.bucket}"]
        destination: out
`;

describe('WorkflowRunnerComponent', () => {
    let component: WorkflowRunnerComponent;
    let fixture: ComponentFixture<WorkflowRunnerComponent>;

    let openFile: ReturnType<typeof vi.fn>;
    let readTextFile: ReturnType<typeof vi.fn>;
    let runWorkflow: ReturnType<typeof vi.fn>;
    let validateWorkflow: ReturnType<typeof vi.fn>;
    let dialogOpen: ReturnType<typeof vi.fn>;

    function build(): void {
        openFile = vi.fn(() => of('/wf/nightly.yaml'));
        readTextFile = vi.fn(() => of(validYaml));
        runWorkflow = vi.fn(() => of({accepted: true, runId: 'run-1', errors: []}));
        validateWorkflow = vi.fn(() => of({valid: true, errors: []}));
        dialogOpen = vi.fn(() => ({afterClosed: () => of(undefined)}));

        TestBed.configureTestingModule({
            imports: [WorkflowRunnerComponent],
            providers: [
                {provide: WailsService, useValue: {openFile, readTextFile}},
                {provide: FmeClientService, useValue: {runWorkflow, validateWorkflow}},
                {provide: MatDialog, useValue: {open: dialogOpen}},
            ],
        });
        fixture = TestBed.createComponent(WorkflowRunnerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    beforeEach(() => build());

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('open + parse', () => {
        it('opens a file, reads it, parses it, and exposes the parsed document', () => {
            component.openWorkflow();
            expect(openFile).toHaveBeenCalled();
            expect(readTextFile).toHaveBeenCalledWith('/wf/nightly.yaml');
            expect(component.document()?.name).toBe('nightly-media-sync');
            expect(component.documentErrors()).toEqual([]);
        });

        it('infers json format from a .json extension', () => {
            openFile.mockReturnValue(of('/wf/x.json'));
            readTextFile.mockReturnValue(of(JSON.stringify({
                apiVersion: 'fme.dev/workflow/v1',
                kind: 'Workflow',
                spec: {steps: [{id: 'a', type: 'Sleep', with: {duration: '5s'}}]},
            })));
            component.openWorkflow();
            expect(component.document()?.format).toBe('json');
        });

        it('does nothing when the user cancels the open dialog', () => {
            openFile.mockReturnValue(of(''));
            component.openWorkflow();
            expect(readTextFile).not.toHaveBeenCalled();
            expect(component.document()).toBeNull();
        });

        it('shows a document error on a malformed file and does not open the wizard', () => {
            readTextFile.mockReturnValue(of('{ not valid'));
            openFile.mockReturnValue(of('/wf/bad.json'));
            component.openWorkflow();
            expect(component.document()).toBeNull();
            expect(component.documentErrors().length).toBeGreaterThan(0);
        });

        it('shows a document error when the file read fails', () => {
            readTextFile.mockReturnValue(throwError(() => new Error('permission denied')));
            component.openWorkflow();
            expect(component.document()).toBeNull();
            expect(component.documentErrors().join(' ')).toContain('permission denied');
        });
    });

    describe('run submission', () => {
        it('calls runWorkflow with the submission and emits runStarted on acceptance', () => {
            component.openWorkflow();
            const started = vi.fn();
            component.runStarted.subscribe(started);

            component.onRun({
                documentText: validYaml,
                format: 'yaml',
                params: [{name: 'bucket', value: 'media', values: []}],
            });

            expect(runWorkflow).toHaveBeenCalledWith(validYaml, WorkflowFormat.YAML, [
                {name: 'bucket', value: 'media', values: []},
            ]);
            expect(started).toHaveBeenCalledWith('run-1');
        });

        it('routes PARAMETER errors to field errors keyed by parameter name', () => {
            runWorkflow.mockReturnValue(of({
                accepted: false,
                runId: '',
                errors: [
                    {kind: WorkflowValidationErrorKind.PARAMETER, parameter: 'bucket', stepId: '', message: 'required'},
                ],
            }));
            component.openWorkflow();
            component.onRun({documentText: validYaml, format: 'yaml', params: []});

            expect(component.fieldErrors()['bucket']).toBe('required');
            expect(component.documentErrors()).toEqual([]);
        });

        it('routes non-parameter errors to the document banner, one message per entry', () => {
            runWorkflow.mockReturnValue(of({
                accepted: false,
                runId: '',
                errors: [
                    {kind: WorkflowValidationErrorKind.PROFILE, parameter: '', stepId: 'ingest', message: 'no such profile'}, {kind: WorkflowValidationErrorKind.GRAPH, parameter: '', stepId: '', message: 'cycle detected'},
                ],
            }));
            component.openWorkflow();
            component.onRun({documentText: validYaml, format: 'yaml', params: []});

            expect(component.documentErrors()).toEqual(['no such profile', 'cycle detected']);
            expect(component.fieldErrors()).toEqual({});
        });

        it('shows a document error and KEEPS the wizard open when the RPC itself errors', () => {
            runWorkflow.mockReturnValue(throwError(() => new Error('daemon down')));
            component.openWorkflow();
            component.onRun({documentText: validYaml, format: 'yaml', params: []});
            expect(component.documentErrors().join(' ')).toContain('daemon down');
            // The open document is preserved so the user does not lose their prompt.
            expect(component.document()).not.toBeNull();
        });

        it('does not emit runStarted when the run is rejected', () => {
            runWorkflow.mockReturnValue(of({accepted: false, runId: '', errors: []}));
            component.openWorkflow();
            const started = vi.fn();
            component.runStarted.subscribe(started);
            component.onRun({documentText: validYaml, format: 'yaml', params: []});
            expect(started).not.toHaveBeenCalled();
        });
    });

    describe('validate submission', () => {
        it('calls validateWorkflow and clears errors when valid', () => {
            component.openWorkflow();
            component.onValidate({documentText: validYaml, format: 'yaml', params: []});
            expect(validateWorkflow).toHaveBeenCalledWith(validYaml, WorkflowFormat.YAML, []);
            expect(component.documentErrors()).toEqual([]);
            expect(component.fieldErrors()).toEqual({});
        });

        it('routes validate errors the same way as run errors', () => {
            validateWorkflow.mockReturnValue(of({
                valid: false,
                errors: [
                    {kind: WorkflowValidationErrorKind.PARAMETER, parameter: 'bucket', stepId: '', message: 'bad'},
                ],
            }));
            component.openWorkflow();
            component.onValidate({documentText: validYaml, format: 'yaml', params: []});
            expect(component.fieldErrors()['bucket']).toBe('bad');
        });

        it('reports a clean validation result for the user', () => {
            component.openWorkflow();
            component.onValidate({documentText: validYaml, format: 'yaml', params: []});
            expect(component.validationPassed()).toBe(true);
        });

        it('shows a document error when the validate RPC errors', () => {
            validateWorkflow.mockReturnValue(throwError(() => new Error('validate boom')));
            component.openWorkflow();
            component.onValidate({documentText: validYaml, format: 'yaml', params: []});
            expect(component.documentErrors().join(' ')).toContain('validate boom');
            expect(component.validationPassed()).toBe(false);
            expect(component.document()).not.toBeNull();
        });
    });

    describe('fieldErrorList', () => {
        it('derives an array view of the field errors map', () => {
            runWorkflow.mockReturnValue(of({
                accepted: false,
                runId: '',
                errors: [
                    {kind: WorkflowValidationErrorKind.PARAMETER, parameter: 'bucket', stepId: '', message: 'required'},
                ],
            }));
            component.openWorkflow();
            component.onRun({documentText: validYaml, format: 'yaml', params: []});
            expect(component.fieldErrorList()).toEqual([{name: 'bucket', message: 'required'}]);
        });
    });

    describe('browse picker', () => {
        it('opens the source picker and feeds the returned paths into the wizard field', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(['/vol/cardA', '/vol/cardB'])});
            component.openWorkflow();
            const append = vi.fn();
            component.wizard = {appendValues: append} as unknown as WorkflowRunnerComponent['wizard'];

            component.onBrowse('source_dir');

            expect(dialogOpen).toHaveBeenCalled();
            expect(append).toHaveBeenCalledWith('source_dir', ['/vol/cardA', '/vol/cardB']);
        });

        it('does nothing when the picker is cancelled (no paths)', () => {
            dialogOpen.mockReturnValue({afterClosed: () => of(undefined)});
            component.openWorkflow();
            const append = vi.fn();
            component.wizard = {appendValues: append} as unknown as WorkflowRunnerComponent['wizard'];

            component.onBrowse('source_dir');

            expect(append).not.toHaveBeenCalled();
        });
    });
});
