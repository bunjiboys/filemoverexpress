import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ParsedWorkflowDocument } from '@app/classes/workflow/workflow-document.model';
import { WorkflowParameter } from '@app/classes/workflow/workflow-parameter.model';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { TransferProfileService } from '@services/transfer-profile/transfer-profile.service';
import { TransferProfileState } from '@services/transfer-profile/transfer-profile.interfaces';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowRunnerWizardComponent } from './workflow-runner-wizard.component';

function doc(overrides: Partial<ParsedWorkflowDocument> = {}): ParsedWorkflowDocument {
    return {
        name: 'nightly-media-sync',
        parameters: [],
        steps: [
            {id: 'ingest', name: 'Ingest cards', type: 'Upload'}, {id: 'verify', name: 'Verify checksums', type: 'Checksum'},
        ],
        documentText: 'apiVersion: fme.dev/workflow/v1',
        format: 'yaml',
        ...overrides,
    };
}

function param(overrides: Partial<WorkflowParameter> = {}): WorkflowParameter {
    return {name: 'bucket', type: 'string', required: false, ...overrides};
}

describe('WorkflowRunnerWizardComponent', () => {
    let component: WorkflowRunnerWizardComponent;
    let fixture: ComponentFixture<WorkflowRunnerWizardComponent>;

    function build(d: ParsedWorkflowDocument, profiles: string[] | null = null): void {
        const txpState = signal<TransferProfileState>({
            transferProfileList: profiles,
            currentTransferProfile: null,
            currentProfileIsOIDC: false,
        });
        TestBed.configureTestingModule({
            imports: [MatIconModule,
                MatTooltipModule,
                FormsModule],
            providers: [
                {provide: TransferProfileService, useValue: {transferProfileStateSig: txpState}},
            ],
        });
        fixture = TestBed.createComponent(WorkflowRunnerWizardComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('document', d);
        fixture.detectChanges();
    }

    it('should create', () => {
        build(doc());
        expect(component).toBeTruthy();
    });

    describe('transfer profiles', () => {
        it('exposes the live transfer-profile list for the dropdown', () => {
            build(doc({parameters: [param({type: 'transfer_profile', required: true})]}), ['prod', 'staging']);
            expect(component['transferProfiles']()).toEqual(['prod', 'staging']);
        });

        it('falls back to an empty list when no daemon is connected', () => {
            build(doc({parameters: [param({type: 'transfer_profile'})]}), null);
            expect(component['transferProfiles']()).toEqual([]);
        });
    });

    describe('initial step', () => {
        it('starts on the parameters step when the workflow declares parameters', () => {
            build(doc({parameters: [param({required: true})]}));
            expect(component.step()).toBe('parameters');
        });

        it('skips straight to confirm when there are no parameters', () => {
            build(doc({parameters: []}));
            expect(component.step()).toBe('confirm');
        });
    });

    describe('field value seeding', () => {
        it('seeds each field from its file default', () => {
            build(doc({parameters: [param({default: 'media'}), param({name: 'n', type: 'int', default: 4})]}));
            expect(component.valueOf('bucket')).toBe('media');
            expect(component.valueOf('n')).toBe('4');
        });

        it('seeds a string_array field from its default array', () => {
            build(doc({parameters: [param({name: 'src', type: 'string_array', default: ['/a', '/b']})]}));
            expect(component.valueOf('src')).toEqual(['/a', '/b']);
        });

        it('valueOf returns empty for an unknown parameter name', () => {
            build(doc({parameters: [param()]}));
            expect(component.valueOf('nonexistent')).toBe('');
        });

        it('falls back to the seeded default when a field has no explicit value yet', () => {
            // currentValue falls back to initialFieldValue for a param not in the value map.
            build(doc({parameters: [param({default: 'media'})]}));
            // Clear the backing map to exercise the fallback branch directly.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (component as any).fieldValues.set(new Map());
            expect(component.valueOf('bucket')).toBe('media');
        });
    });

    describe('readiness gating', () => {
        it('is not ready while a required field is empty', () => {
            build(doc({parameters: [param({required: true})]}));
            expect(component.ready()).toBe(false);
        });

        it('becomes ready once every field is valid', () => {
            build(doc({parameters: [param({required: true})]}));
            component.setValue('bucket', 'archive');
            fixture.detectChanges();
            expect(component.ready()).toBe(true);
        });

        it('disables the Next button while not ready', () => {
            build(doc({parameters: [param({required: true})]}));
            const next = fixture.nativeElement.querySelector('.fme-wizard-next');
            expect(next.disabled).toBe(true);
        });

        it('enables Next once ready', () => {
            build(doc({parameters: [param({required: true})]}));
            component.setValue('bucket', 'archive');
            fixture.detectChanges();
            expect(fixture.nativeElement.querySelector('.fme-wizard-next').disabled).toBe(false);
        });
    });

    describe('navigation', () => {
        it('advances to confirm on Next when ready', () => {
            build(doc({parameters: [param({required: true})]}));
            component.setValue('bucket', 'archive');
            fixture.detectChanges();
            fixture.nativeElement.querySelector('.fme-wizard-next').click();
            expect(component.step()).toBe('confirm');
        });

        it('does not advance on Next while not ready', () => {
            build(doc({parameters: [param({required: true})]}));
            component.next();
            expect(component.step()).toBe('parameters');
        });

        it('goes back to parameters from confirm', () => {
            build(doc({parameters: [param({required: true})]}));
            component.setValue('bucket', 'ok');
            component.next();
            expect(component.step()).toBe('confirm');
            component.back();
            expect(component.step()).toBe('parameters');
        });
    });

    describe('live rail summary', () => {
        it('reports the set-parameter count (non-empty values)', () => {
            build(doc({parameters: [param(), param({name: 'other'})]}));
            expect(component.paramsSetCount()).toBe(0);
            component.setValue('bucket', 'x');
            fixture.detectChanges();
            expect(component.paramsSetCount()).toBe(1);
        });

        it('counts a non-empty string_array as set', () => {
            build(doc({parameters: [param({name: 'src', type: 'string_array'})]}));
            component.setValue('src', ['/a']);
            fixture.detectChanges();
            expect(component.paramsSetCount()).toBe(1);
        });

        it('renders the workflow name and step count in the rail', () => {
            build(doc({parameters: [param()]}));
            const rail = fixture.nativeElement.querySelector('.fme-wizard-rail').textContent;
            expect(rail).toContain('nightly-media-sync');
            expect(rail).toContain('2');
        });
    });

    describe('submission payload', () => {
        it('builds a submission with scalar value and array values', () => {
            build(doc({
                parameters: [
                    param({name: 'bucket', default: 'media'}), param({name: 'src', type: 'string_array', default: ['/a']}),
                ],
            }));
            const payload = component.buildSubmission();
            expect(payload).toEqual([
                {name: 'bucket', value: 'media', values: []}, {name: 'src', value: '', values: ['/a']},
            ]);
        });

        it('emits runRequested with document text, format, and params on Run', () => {
            build(doc({parameters: []}));
            const run = vi.fn();
            component.runRequested.subscribe(run);
            fixture.nativeElement.querySelector('.fme-wizard-run').click();
            expect(run).toHaveBeenCalledWith({
                documentText: 'apiVersion: fme.dev/workflow/v1',
                format: 'yaml',
                params: [],
            });
        });

        it('emits validateRequested with the same payload on Validate', () => {
            build(doc({parameters: [param({default: 'media'})]}));
            component.setValue('bucket', 'media');
            component.next();
            fixture.detectChanges();
            const validate = vi.fn();
            component.validateRequested.subscribe(validate);
            fixture.nativeElement.querySelector('.fme-wizard-validate').click();
            expect(validate).toHaveBeenCalledWith({
                documentText: 'apiVersion: fme.dev/workflow/v1',
                format: 'yaml',
                params: [{name: 'bucket', value: 'media', values: []}],
            });
        });
    });

    describe('stepper', () => {
        it('shows the three stepper phases', () => {
            build(doc({parameters: [param()]}));
            const steps = fixture.nativeElement.querySelectorAll('.fme-stepper-step');
            expect(steps).toHaveLength(3);
            expect(steps[0].textContent).toContain('Open');
            expect(steps[1].textContent).toContain('Parameters');
            expect(steps[2].textContent).toContain('Confirm');
        });
    });

    describe('browse relay + appendValues', () => {
        it('emits browseRequested with the parameter name', () => {
            build(doc({parameters: [param({name: 'src', type: 'string_array'})]}));
            const browse = vi.fn();
            component.browseRequested.subscribe(browse);
            component.onBrowse('src');
            expect(browse).toHaveBeenCalledWith('src');
        });

        it('appends picked paths to a string_array field', () => {
            build(doc({parameters: [param({name: 'src', type: 'string_array', default: ['/a']})]}));
            component.appendValues('src', ['/b', '/c']);
            expect(component.valueOf('src')).toEqual(['/a',
                '/b',
                '/c']);
        });

        it('de-duplicates appended paths against existing values', () => {
            build(doc({parameters: [param({name: 'src', type: 'string_array', default: ['/a']})]}));
            component.appendValues('src', ['/a', '/b']);
            expect(component.valueOf('src')).toEqual(['/a', '/b']);
        });
    });
});
