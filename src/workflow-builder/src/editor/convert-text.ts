import { documentToText, textToDocument, type EditorFormat } from './editor-text';

// Convert editor text from one format to the other by round-tripping through the
// document model: parse the current text in `from`, then serialize to `to`. Used when
// the user switches the YAML/JSON toggle so the content moves with the format instead
// of being reinterpreted as the new syntax (which would otherwise cause spurious
// validation errors).
//
// Same-format conversion is a no-op. If the current text cannot be parsed (the user is
// mid-edit with invalid syntax), the original text is returned unchanged rather than
// discarded - a format switch must never lose the user's work.
export function convertText(text: string, from: EditorFormat, to: EditorFormat): string {
    if (from === to) {
        return text;
    }
    const parsed = textToDocument(text, from);
    if (!parsed.ok) {
        return text;
    }
    return documentToText(parsed.document, to);
}
