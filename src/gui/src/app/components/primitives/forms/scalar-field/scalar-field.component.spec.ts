import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkflowParameter } from '@app/classes/workflow/workflow-parameter.model';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { ScalarFieldComponent } from './scalar-field.component';

function scalarParam(overrides: Partial<WorkflowParameter> = {}): WorkflowParameter {
    return {
        name: 'bucket',
        type: 'string',
        required: false,
        ...overrides,
    };
}

describe('ScalarFieldComponent', () => {
    let component: ScalarFieldComponent;
    let fixture: ComponentFixture<ScalarFieldComponent>;

    function build(param: WorkflowParameter, value = '', transferProfiles: readonly string[] = []): void {
        TestBed.configureTestingModule({
            imports: [MatIconModule,
                MatTooltipModule,
                FormsModule],
        });
        fixture = TestBed.createComponent(ScalarFieldComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('parameter', param);
        fixture.componentRef.setInput('value', value);
        fixture.componentRef.setInput('transferProfiles', transferProfiles);
        fixture.detectChanges();
    }

    it('should create', () => {
        build(scalarParam());
        expect(component).toBeTruthy();
    });

    describe('control selection by type', () => {
        it('renders a text input for a string', () => {
            build(scalarParam({type: 'string'}));
            const input = fixture.nativeElement.querySelector('mat-form-field.fme-scalar-field-input input[matInput]');
            expect(input).toBeTruthy();
            expect(input.getAttribute('type')).toBe('text');
        });

        it('renders a number input for an int', () => {
            build(scalarParam({type: 'int', default: 0}), '0');
            const input = fixture.nativeElement.querySelector('mat-form-field.fme-scalar-field-input input[matInput]');
            expect(input.getAttribute('type')).toBe('number');
            expect(input.getAttribute('step')).toBe('1');
        });

        it('renders a number input with any step for a float', () => {
            build(scalarParam({type: 'float', default: 0}), '0');
            const input = fixture.nativeElement.querySelector('mat-form-field.fme-scalar-field-input input[matInput]');
            expect(input.getAttribute('type')).toBe('number');
            expect(input.getAttribute('step')).toBe('any');
        });

        it('renders a mat-slide-toggle for a bool', () => {
            build(scalarParam({type: 'bool', default: false}), 'false');
            expect(fixture.nativeElement.querySelector('mat-slide-toggle.fme-scalar-toggle')).toBeTruthy();
        });

        it('renders a mat-select for an enum', () => {
            build(scalarParam({type: 'enum', values: ['a', 'b'], required: false}));
            expect(fixture.nativeElement.querySelector('mat-select')).toBeTruthy();
            expect(fixture.nativeElement.querySelector('mat-form-field.fme-scalar-enum')).toBeTruthy();
        });

        it('marks a required enum with no default as required', () => {
            build(scalarParam({type: 'enum', values: ['a', 'b'], required: true}));
            expect(fixture.nativeElement.querySelector('.fme-required-marker')).toBeTruthy();
        });

        it('does not mark an optional enum as required', () => {
            build(scalarParam({type: 'enum', values: ['a', 'b'], required: false}));
            expect(fixture.nativeElement.querySelector('.fme-required-marker')).toBeNull();
        });

        it('emits the chosen enum value via onText', () => {
            build(scalarParam({type: 'enum', values: ['a', 'b'], required: false}));
            const changed = vi.fn();
            component.valueChange.subscribe(changed);
            component.onText('b');
            expect(changed).toHaveBeenCalledWith('b');
        });

        it('renders a mat-select over the live transfer profiles for a transfer_profile', () => {
            build(scalarParam({type: 'transfer_profile', required: false}), '', ['prod', 'staging']);
            expect(fixture.nativeElement.querySelector('mat-select')).toBeTruthy();
            expect(fixture.nativeElement.querySelector('mat-form-field.fme-scalar-enum')).toBeTruthy();
            expect(component['profileOptions']()).toEqual(['prod', 'staging']);
        });

        it('exposes the profile options and an empty form for an optional transfer_profile', () => {
            build(scalarParam({type: 'transfer_profile', required: false}), '', ['prod']);
            // mat-select renders its options lazily in an overlay, so assert on the data the
            // template binds: the live options and the optional field's empty form.
            expect(component['profileOptions']()).toEqual(['prod']);
            expect(component['required']()).toBe(false);
        });

        it('has no empty form for a required transfer_profile', () => {
            build(scalarParam({type: 'transfer_profile', required: true}), '', ['prod', 'staging']);
            expect(component['profileOptions']()).toEqual(['prod', 'staging']);
            expect(component['required']()).toBe(true);
        });

        it('marks a required transfer_profile with no default as required', () => {
            build(scalarParam({type: 'transfer_profile', required: true}), '', ['prod']);
            expect(fixture.nativeElement.querySelector('.fme-required-marker')).toBeTruthy();
        });

        it('emits the chosen transfer profile name via onText', () => {
            build(scalarParam({type: 'transfer_profile', required: false}), '', ['prod', 'staging']);
            const changed = vi.fn();
            component.valueChange.subscribe(changed);
            component.onText('staging');
            expect(changed).toHaveBeenCalledWith('staging');
        });

        it('defaults transferProfiles to empty for a non-transfer_profile type', () => {
            build(scalarParam({type: 'string'}));
            expect(component['profileOptions']()).toEqual([]);
        });
    });

    describe('value emission', () => {
        it('emits the typed text for a string', () => {
            build(scalarParam({type: 'string'}));
            const changed = vi.fn();
            component.valueChange.subscribe(changed);
            component.onText('media');
            expect(changed).toHaveBeenCalledWith('media');
        });

        it('emits "true"/"false" strings for a bool toggle', () => {
            build(scalarParam({type: 'bool', default: false}), 'false');
            const changed = vi.fn();
            component.valueChange.subscribe(changed);
            component.onToggle(true);
            expect(changed).toHaveBeenCalledWith('true');
            component.onToggle(false);
            expect(changed).toHaveBeenCalledWith('false');
        });

        it('reports a bool as checked when its value is the string "true"', () => {
            build(scalarParam({type: 'bool', default: true}), 'true');
            expect(component.checked()).toBe(true);
        });
    });

    describe('validation + label', () => {
        it('shows the required message for a required empty field', () => {
            build(scalarParam({required: true}), '');
            expect(fixture.nativeElement.querySelector('.fme-field-error').textContent)
                .toContain('bucket is required');
        });

        it('shows a pattern-mismatch message', () => {
            build(scalarParam({pattern: '^[a-z]+$'}), 'Mixed');
            expect(fixture.nativeElement.querySelector('.fme-field-error').textContent)
                .toContain('bucket does not match pattern ^[a-z]+$');
        });

        it('shows an int out-of-range message', () => {
            build(scalarParam({type: 'int', min: 1, max: 8, default: 1}), '9');
            expect(fixture.nativeElement.querySelector('.fme-field-error').textContent)
                .toContain('bucket must be <= 8');
        });

        it('shows no error when valid', () => {
            build(scalarParam({type: 'string', required: false}), 'ok');
            expect(fixture.nativeElement.querySelector('.fme-field-error')).toBeNull();
        });

        it('shows the name and type in the label', () => {
            build(scalarParam({type: 'int', default: 0}), '0');
            const label = fixture.nativeElement.querySelector('.fme-field-label').textContent;
            expect(label).toContain('bucket');
            expect(label).toContain('int');
        });

        it('marks the label required for an effectively-required field', () => {
            build(scalarParam({type: 'int'}), '');
            expect(fixture.nativeElement.querySelector('.fme-required-marker')).toBeTruthy();
        });

        it('does not mark an optional string required', () => {
            build(scalarParam({type: 'string', required: false}), '');
            expect(fixture.nativeElement.querySelector('.fme-required-marker')).toBeNull();
        });
    });

    describe('override + revert', () => {
        it('flags an override when the value differs from the default', () => {
            build(scalarParam({default: 'media'}), 'archive');
            expect(fixture.nativeElement.querySelector('.fme-override-badge')).toBeTruthy();
        });

        it('does not flag an override at the default', () => {
            build(scalarParam({default: 'media'}), 'media');
            expect(fixture.nativeElement.querySelector('.fme-override-badge')).toBeNull();
        });

        it('reverts to the file default', () => {
            build(scalarParam({default: 'media'}), 'archive');
            const changed = vi.fn();
            component.valueChange.subscribe(changed);
            fixture.nativeElement.querySelector('.fme-revert').click();
            expect(changed).toHaveBeenCalledWith('media');
        });

        it('reverts to empty when no default is declared', () => {
            build(scalarParam({required: false}), 'typed');
            const changed = vi.fn();
            component.valueChange.subscribe(changed);
            component.revert();
            expect(changed).toHaveBeenCalledWith('');
        });
    });
});
