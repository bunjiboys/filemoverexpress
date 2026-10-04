import { ComponentFixture, TestBed } from '@angular/core/testing';
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

    function build(): void {
        openFile = vi.fn(() => of('/wf/nightly.yaml'));
        readTextFile = vi.fn(() => of(validYaml));
        runWorkflow = vi.fn(() => of({accepted: true, runId: 'run-1', errors: []}));
        validateWorkflow = vi.fn(() => of({valid: true, errors: []}));

        TestBed.configureTestingModule({
            imports: [WorkflowRunnerComponent],
            providers: [
                {provide: WailsService, useValue: {openFile, readTextFile}}, {provide: FmeClientService, useValue: {runWorkflow, validateWorkflow}},
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
            expect(component.documentError()).toBeNull();
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
            expect(component.documentError()).toContain('');
            expect(component.documentError()).not.toBeNull();
        });

        it('shows a document error when the file read fails', () => {
            readTextFile.mockReturnValue(throwError(() => new Error('permission denied')));
            component.openWorkflow();
            expect(component.document()).toBeNull();
            expect(component.documentError()).toContain('permission denied');
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
            expect(component.documentError()).toBeNull();
        });

        it('routes non-parameter errors to the document banner', () => {
            runWorkflow.mockReturnValue(of({
                accepted: false,
                runId: '',
                errors: [
                    {kind: WorkflowValidationErrorKind.PROFILE, parameter: '', stepId: 'ingest', message: 'no such profile'},
                ],
            }));
            component.openWorkflow();
            component.onRun({documentText: validYaml, format: 'yaml', params: []});

            expect(component.documentError()).toContain('no such profile');
            expect(component.fieldErrors()).toEqual({});
        });

        it('shows a document error when the RPC itself errors', () => {
            runWorkflow.mockReturnValue(throwError(() => new Error('daemon down')));
            component.openWorkflow();
            component.onRun({documentText: validYaml, format: 'yaml', params: []});
            expect(component.documentError()).toContain('daemon down');
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
            expect(component.documentError()).toBeNull();
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
            expect(component.documentError()).toContain('validate boom');
            expect(component.validationPassed()).toBe(false);
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
});
