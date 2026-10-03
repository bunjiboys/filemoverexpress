// Known acronyms that should render fully uppercased in a field label rather than
// title-cased (MHL, S3, MD5, ...). Matched case-insensitively against each word.
const ACRONYMS = new Set(['mhl',
    's3',
    'md5',
    'id',
    'url',
    'uri',
    'mb',
    'kb',
    'gb']);

// Turn a schema property key into a human Title Case label FOR DISPLAY ONLY. The key
// itself remains the `with` payload key, so this changes nothing about serialization
// or validation (docs section 2). camelCase is split into words, each word is
// title-cased, and a known acronym is fully uppercased.
export function humanizeFieldLabel(name: string): string {
    return name
        // Insert a space between a lowercase/digit and a following uppercase letter so
        // camelCase becomes separate words; a digit stays with its leading letters
        // (s3 -> one word).
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(' ')
        .map(titleCaseWord)
        .join(' ');
}

function titleCaseWord(word: string): string {
    if (word === '') {
        return word;
    }
    if (ACRONYMS.has(word.toLowerCase())) {
        return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
}
