import { describe, it, expect } from 'vitest';
import { humanizeFieldLabel } from './humanize-label';

// The property form derives field names from the schema's camelCase property keys,
// which read poorly as raw labels (transferProfile, s3PrefixToTrim, writeMhl). This
// pure helper turns a schema key into a human Title Case label for display only - the
// key itself stays the `with` payload key, so nothing about serialization changes.
describe('humanizeFieldLabel', () => {
    it('title-cases a single lowercase word', () => {
        expect(humanizeFieldLabel('name')).toBe('Name');
        expect(humanizeFieldLabel('sources')).toBe('Sources');
        expect(humanizeFieldLabel('duration')).toBe('Duration');
    });

    it('splits camelCase into spaced Title Case words', () => {
        expect(humanizeFieldLabel('transferProfile')).toBe('Transfer Profile');
        expect(humanizeFieldLabel('uploadBasePath')).toBe('Upload Base Path');
        expect(humanizeFieldLabel('failOnMismatch')).toBe('Fail On Mismatch');
        expect(humanizeFieldLabel('continueOnError')).toBe('Continue On Error');
    });

    it('uppercases known acronyms', () => {
        expect(humanizeFieldLabel('writeMhl')).toBe('Write MHL');
        expect(humanizeFieldLabel('mhlOutput')).toBe('MHL Output');
    });

    it('keeps a leading acronym+number token like s3 as S3', () => {
        expect(humanizeFieldLabel('s3PrefixToTrim')).toBe('S3 Prefix To Trim');
    });

    it('handles an already-capitalized word', () => {
        expect(humanizeFieldLabel('Recursive')).toBe('Recursive');
    });

    it('returns an empty string unchanged', () => {
        expect(humanizeFieldLabel('')).toBe('');
    });
});
