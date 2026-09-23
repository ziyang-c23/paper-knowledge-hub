import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  initializeWorkspace,
  putRecord,
  readWorkspace,
  commitWorkspace,
  withWorkspaceLock,
} from '../../services/workspace-store.mjs';
import {
  createNoteTemplate,
  NOTE_SECTIONS,
  NOTE_TEMPLATE_VERSION,
} from '../../src/lib/note-template.mjs';

const run = promisify(execFile);
const repo = path.resolve('.');
const script = path.join(repo, 'scripts/ai-pipeline.mjs');

test('downloadable templates use the shared browser and AI contract', async () => {
  assert.equal(
    await readFile(path.join(repo, 'templates/paper-note.md'), 'utf8'),
    createNoteTemplate(),
  );
  const recommended = JSON.parse(
    await readFile(path.join(repo, 'templates/paper-recommended.json'), 'utf8'),
  );
  assert.equal(recommended.note, createNoteTemplate());
});

test('AI context defaults output correctly, preserves old notes, excludes private fields and scopes PDF material', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pkh-ai-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  const note = '## 论文概览\nExisting legacy note.\n\n## 附录\nExisting appendix.';
  for (const id of ['paper-a', 'paper-b']) {
    store = await putRecord(root, {
      collection: 'papers',
      expectedRevision: store.revision,
      record: {
        schemaVersion: 1,
        id,
        title: `Synthetic ${id}`,
        year: 2026,
        authors: [],
        url: `https://example.org/${id}`,
        visibility: 'private',
        note,
        personalAnalysis: 'PERSONAL-MARKER',
        privateNotes: 'LEGACY-PRIVATE-MARKER',
      },
    });
  }
  const documentId = 'doc-' + 'a'.repeat(32);
  const otherId = 'doc-' + 'b'.repeat(32);
  const detachedId = 'doc-' + 'c'.repeat(32);
  await mkdir(path.join(root, 'private/documents'), { recursive: true });
  for (const [id, paperId, text] of [
    [documentId, 'paper-a', 'CURRENT-PDF-TEXT'],
    [otherId, 'paper-b', 'OTHER-PAPER-TEXT'],
    [detachedId, 'paper-a', 'DETACHED-PDF-TEXT'],
  ]) {
    await writeFile(
      path.join(root, 'private/documents', id + '.json'),
      JSON.stringify({
        id,
        paperId,
        filename: 'fixture.pdf',
        pageCount: 1,
        sha256: 'fixture',
        pages: [{ pageIndex: 1, text, warnings: ['layout-review-needed'] }],
      }),
    );
  }
  await withWorkspaceLock(root, () =>
    commitWorkspace(root, {
      ...store,
      documentIds: [documentId, otherId],
    }),
  );
  const before = await readFile(path.join(root, 'private/workspace.json'), 'utf8');
  store = await readWorkspace(root);
  const result = await run(process.execPath, [script, '--paper', 'paper-a'], { cwd: root });
  const output = JSON.parse(result.stdout);
  assert.equal(output.output, 'private/ai-drafts/paper-a-context.json');
  const raw = await readFile(path.join(root, output.output), 'utf8');
  const context = JSON.parse(raw);
  assert.equal(context.baseRevision, store.revision);
  assert.equal(context.workflowVersion, NOTE_TEMPLATE_VERSION);
  assert.equal(context.paper.note, note);
  assert.equal(context.paper.personalAnalysis, undefined);
  assert.equal(context.paper.privateNotes, undefined);
  assert.doesNotMatch(
    raw,
    /PERSONAL-MARKER|LEGACY-PRIVATE-MARKER|OTHER-PAPER-TEXT|DETACHED-PDF-TEXT/,
  );
  assert.equal(context.documents.length, 1);
  assert.equal(context.documents[0].pages[0].text, 'CURRENT-PDF-TEXT');
  assert.deepEqual(context.documents[0].pages[0].warnings, ['layout-review-needed']);
  assert.deepEqual(context.recommendedSections, NOTE_SECTIONS);
  assert.equal(context.noteTemplate, createNoteTemplate());
  assert.equal(await readFile(path.join(root, 'private/workspace.json'), 'utf8'), before);

  for (const args of [
    [],
    ['--paper'],
    ['--paper', 'paper-a', '--out'],
    ['--paper', '--out', 'x'],
    ['--paper', 'paper-a', '--bad', 'x'],
    ['--paper', 'paper-a', '--out', 'outside.json'],
  ]) {
    await assert.rejects(() => run(process.execPath, [script, ...args], { cwd: root }));
  }
  await assert.rejects(readFile(path.join(root, 'outside.json')), { code: 'ENOENT' });
  const custom = await run(
    process.execPath,
    [script, '--out', 'private/exports/context.json', '--paper', 'paper-a'],
    { cwd: root },
  );
  assert.equal(JSON.parse(custom.stdout).output, 'private/exports/context.json');
});
