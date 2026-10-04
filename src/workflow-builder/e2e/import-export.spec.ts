import { expect, test } from '@playwright/test';
import {
    editorText,
    flowNode,
    flowNodes,
    forceFileFallbacks,
    openApp,
    SEED_NODE_COUNT,
    selectViewMode,
} from './helpers';

// Tier-2 import/export round-trip (docs sections 6, 9): the whole point of the builder
// is to produce and re-open workflow files. These force the File System Access API off
// so open/save take the <input>/download fallbacks Playwright can drive, then assert:
// export writes the canonical document, a bad import surfaces an error without
// corrupting the model, and export-then-reimport yields the same graph.

test.beforeEach(async ({ page }) => {
    await forceFileFallbacks(page);
    await openApp(page);
});

// A minimal but schema-valid workflow document distinct from the seed, used to prove
// import replaces the model.
const IMPORT_YAML = `apiVersion: fme.dev/workflow/v1
kind: Workflow
metadata:
  name: Imported single-step
spec:
  steps:
    - id: only
      name: The only step
      type: Sleep
      with:
        duration: 10s
      continueOnError: false
`;

test('export downloads the canonical workflow document', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const download = await downloadPromise;
    // Default export name is derived from metadata.name (export-name.ts).
    expect(download.suggestedFilename()).toMatch(/\.ya?ml$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text).toContain('apiVersion: fme.dev/workflow/v1');
    expect(text).toContain('kind: Workflow');
    expect(text).toContain('Nightly media ingest and archive');
    // The five seeded steps are all present with their dependsOn reconstructed.
    expect(text).toContain('id: ingest');
    expect(text).toContain('id: archive');
    expect(text).toContain('dependsOn');
});

test('importing a file replaces the model and lays out its graph', async ({ page }) => {
    // The Open button triggers the hidden <input type=file> fallback; set its files.
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('import').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
        name: 'imported.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from(IMPORT_YAML, 'utf8'),
    });

    // The seed is gone; the single imported node is laid out.
    await expect(flowNodes(page)).toHaveCount(1);
    await expect(flowNode(page, 'only')).toContainText('The only step');
    await expect(flowNode(page, 'ingest')).toHaveCount(0);
});

test('a malformed import surfaces an error and keeps the current model', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('import').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
        name: 'broken.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from('this: is: not: a: workflow\n', 'utf8'),
    });

    // A flash reports the bad import, and the seeded graph is untouched.
    await expect(page.getByText('Could not import file')).toBeVisible();
    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
});

test('export then re-import yields the same graph (round-trip)', async ({ page }) => {
    // Capture the canonical text the app would export (the editor is the text
    // projection of the exact same model export serializes). The editor loads lazily,
    // so wait until its Ace model holds the document before capturing.
    await selectViewMode(page, 'Split');
    let exported = '';
    await expect(async () => {
        exported = await editorText(page);
        expect(exported).toContain('Nightly media ingest and archive');
    }).toPass({ timeout: 10_000 });

    // Re-import that exact text and confirm the graph matches the seed (same node ids,
    // same count), proving serialize(parse(x)) round-trips through the UI.
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('import').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
        name: 'roundtrip.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from(exported, 'utf8'),
    });

    await expect(flowNodes(page)).toHaveCount(SEED_NODE_COUNT);
    for (const id of ['ingest',
        'verify',
        'settle',
        'inventory',
        'archive']) {
        await expect(flowNode(page, id)).toBeVisible();
    }
    // And re-exporting the re-imported graph produces identical canonical text.
    await expect(async () => {
        const reExported = await editorText(page);
        expect(reExported).toEqual(exported);
    }).toPass({ timeout: 10_000 });
});
