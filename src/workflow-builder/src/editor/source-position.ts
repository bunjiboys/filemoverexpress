import { parseDocument, LineCounter, isNode } from 'yaml';

export interface SourcePosition {
    row: number; // 0-based line
    column: number; // 0-based column
}

// Map an ajv JSON-pointer instancePath (/spec, /spec/steps/0/with/duration) to the
// 0-based {row, column} of the node it addresses, so a schema error annotates the
// offending line instead of defaulting to line 1 (docs section 10). The yaml library
// parses JSON as a superset, so this works for both editor formats; it reads the
// node's source range through a LineCounter. Returns undefined when the text does not
// parse or the path does not resolve to a node with a range.
export function instancePathToPosition(text: string, instancePath: string): SourcePosition | undefined {
    const lineCounter = new LineCounter();
    const doc = parseDocument(text, { lineCounter });
    if (doc.errors.length > 0) {
        return undefined;
    }

    // The empty pointer is the document root.
    if (instancePath === '') {
        return { row: 0, column: 0 };
    }

    const path = instancePath
        .split('/')
        .slice(1) // leading '' before the first '/'
        .map(decodePointerSegment);

    const node = doc.getIn(path, true);
    if (!isNode(node) || node.range === null || node.range === undefined) {
        return undefined;
    }

    // range[0] is the node's start offset; linePos gives 1-based line/col.
    const { line, col } = lineCounter.linePos(node.range[0]);
    return { row: line - 1, column: col - 1 };
}

// Decode a JSON-pointer path segment: ~1 -> '/', ~0 -> '~' (RFC 6901). Order matters:
// ~1 is decoded before ~0 so an encoded '~1' is not corrupted.
function decodePointerSegment(segment: string): string {
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}
