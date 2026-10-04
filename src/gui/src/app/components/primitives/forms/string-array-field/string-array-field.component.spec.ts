import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkflowParameter } from '@app/classes/workflow/workflow-parameter.model';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { StringArrayFieldComponent } from './string-array-field.component';

function arrayParam(overrides: Partial<WorkflowParameter> = {}): WorkflowParameter {
    return {
        name: 'source_dir',
        type: 'string_array',
        required: true,
        ...overrides,
    };
}

describe('StringArrayFieldComponent', () => {
    let component: StringArrayFieldComponent;
    let fixture: ComponentFixture<StringArrayFieldComponent>;

    function build(param: WorkflowParameter, values: string[] = []): void {
        TestBed.configureTestingModule({
            imports: [MatIconModule,
                MatTooltipModule,
                FormsModule],
        });
        fixture = TestBed.createComponent(StringArrayFieldComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('parameter', param);
        fixture.componentRef.setInput('values', values);
        fixture.detectChanges();
    }

    it('should create', () => {
        build(arrayParam());
        expect(component).toBeTruthy();
    });

    it('renders a chip per value showing its leaf name with the full path as the title', () => {
        build(arrayParam({required: false}), ['/mnt/cardA', '/mnt/cardB']);
        const chips = fixture.nativeElement.querySelectorAll('.fme-chip');
        expect(chips).toHaveLength(2);
        expect(chips[0].textContent).toContain('cardA');
        expect(chips[0].getAttribute('title')).toBe('/mnt/cardA');
    });

    it('removing a chip emits the remaining values in order', () => {
        build(arrayParam({required: false}), ['/a',
            '/b',
            '/c']);
        const changed = vi.fn();
        component.valuesChange.subscribe(changed);

        // Remove the middle chip.
        fixture.nativeElement.querySelectorAll('.fme-chip-remove')[1].click();

        expect(changed).toHaveBeenCalledWith(['/a', '/c']);
    });

    it('adds a typed path, trims it, emits, and clears the entry box', () => {
        build(arrayParam({required: false}), ['/a']);
        const changed = vi.fn();
        component.valuesChange.subscribe(changed);

        component.entry = '  /b  ';
        component.addEntry();

        expect(changed).toHaveBeenCalledWith(['/a', '/b']);
        expect(component.entry).toBe('');
    });

    it('does not add an empty or whitespace-only entry', () => {
        build(arrayParam({required: false}), ['/a']);
        const changed = vi.fn();
        component.valuesChange.subscribe(changed);

        component.entry = '   ';
        component.addEntry();

        expect(changed).not.toHaveBeenCalled();
        expect(component.entry).toBe('   ');
    });

    it('does not add a duplicate path already present', () => {
        build(arrayParam({required: false}), ['/a']);
        const changed = vi.fn();
        component.valuesChange.subscribe(changed);

        component.entry = '/a';
        component.addEntry();

        expect(changed).not.toHaveBeenCalled();
    });

    it('emits browseRequested when the Browse button is clicked', () => {
        build(arrayParam());
        const browse = vi.fn();
        component.browseRequested.subscribe(browse);

        fixture.nativeElement.querySelector('.fme-browse-trigger').click();

        expect(browse).toHaveBeenCalledTimes(1);
    });

    it('shows the required-empty validation message for a required empty field', () => {
        build(arrayParam(), []);
        expect(fixture.nativeElement.querySelector('.fme-field-error').textContent)
            .toContain('source_dir requires at least one value');
    });

    it('shows no validation message when a required field has values', () => {
        build(arrayParam(), ['/a']);
        expect(fixture.nativeElement.querySelector('.fme-field-error')).toBeNull();
    });

    it('shows the pattern-mismatch message naming the offending element', () => {
        build(arrayParam({pattern: '^/.*'}), ['/ok', 'bad']);
        expect(fixture.nativeElement.querySelector('.fme-field-error').textContent)
            .toContain('source_dir element "bad" does not match pattern ^/.*');
    });

    it('flags an override when the value differs from the file default', () => {
        build(arrayParam({required: false, default: ['/a']}), ['/a', '/b']);
        expect(fixture.nativeElement.querySelector('.fme-override-badge')).toBeTruthy();
    });

    it('does not flag an override when the value equals the file default', () => {
        build(arrayParam({required: false, default: ['/a']}), ['/a']);
        expect(fixture.nativeElement.querySelector('.fme-override-badge')).toBeNull();
    });

    it('reverts to the file default when revert is clicked', () => {
        build(arrayParam({required: false, default: ['/a']}), ['/a', '/b']);
        const changed = vi.fn();
        component.valuesChange.subscribe(changed);

        fixture.nativeElement.querySelector('.fme-revert').click();

        expect(changed).toHaveBeenCalledWith(['/a']);
    });

    it('reverts to empty when the file declares no default', () => {
        build(arrayParam(), ['/a', '/b']);
        const changed = vi.fn();
        component.valuesChange.subscribe(changed);

        component.revert();

        expect(changed).toHaveBeenCalledWith([]);
    });

    it('shows the parameter name and type as the field label and hint', () => {
        build(arrayParam());
        const label = fixture.nativeElement.querySelector('.fme-field-label').textContent;
        expect(label).toContain('source_dir');
        expect(label).toContain('string_array');
    });

    it('marks the label required when the field is required', () => {
        build(arrayParam());
        expect(fixture.nativeElement.querySelector('.fme-required-marker')).toBeTruthy();
    });
});
