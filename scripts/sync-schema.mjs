// Copy the authoritative workflow JSON Schema into each consumer package that must
// bundle its own physical copy, so the daemon, the GUI, and the workflow-builder all
// validate against exactly the same contract.
//
// Why copies exist at all: Go's //go:embed can only reach files inside the embedding
// package's own tree, and the TS bundlers resolve `import schema from './v1.json'`
// relative to the importing file -- so a single shared path is not reachable by all
// three. The copies are GENERATED, not hand-maintained: this script is the generator
// (wired into `task schema:sync`, a dep of `task generate`), and a byte-identical guard
// test in each consumer fails CI if a copy drifts from the source of truth.
//
// Cross-platform: pure Node fs (no `cp`, which does not exist on Windows), paths built
// with node:path so separators are correct on macOS, Linux, and Windows, and the file
// is read/written as a UTF-8 string so the bytes are identical regardless of platform.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The single source of truth.
const SOURCE = join(repoRoot, 'schemas', 'workflow', 'v1.json');

// Every consumer copy that must stay byte-identical to SOURCE. Keep this list in sync
// with the guard tests (one per consumer) that assert the same equality.
const TARGETS = [
    join(repoRoot, 'src', 'cli', 'workflow', 'schema', 'v1.json'),
    join(repoRoot, 'src', 'gui', 'src', 'app', 'classes', 'workflow', 'schema', 'v1.json'),
    join(repoRoot, 'src', 'workflow-builder', 'src', 'schema', 'v1.json'),
];

// --check (CI-friendly): report drift and exit non-zero without writing. Default: write.
const checkOnly = process.argv.includes('--check');

const source = readFileSync(SOURCE, 'utf8');
let drifted = 0;

for (const target of TARGETS) {
    const rel = relative(repoRoot, target);
    let current = null;
    try {
        current = readFileSync(target, 'utf8');
    } catch {
        current = null; // missing copy counts as drift / needs writing
    }

    if (current === source) {
        continue;
    }

    if (checkOnly) {
        console.error(`DRIFT: ${rel} differs from schemas/workflow/v1.json`);
        drifted += 1;
        continue;
    }

    writeFileSync(target, source);
    console.log(`synced: ${rel}`);
}

if (checkOnly && drifted > 0) {
    console.error(`\n${drifted} schema copy/copies drifted. Run \`task schema:sync\` to regenerate.`);
    process.exit(1);
}

if (!checkOnly) {
    console.log('schema copies are in sync with schemas/workflow/v1.json');
}
