import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initializeWorkspace,
  backupWorkspace,
  restoreWorkspace,
  readWorkspace,
  withWorkspaceLock,
} from '../../services/workspace-store.mjs';
import { saveDraft, listDrafts } from '../../services/drafts.mjs';
const entity = {
  schemaVersion: 1,
  id: 'method-a',
  title: 'Method A',
  kind: 'method',
  visibility: 'private',
};
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pkh-auxiliary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await initializeWorkspace(root, { write: true });
  const draft = await saveDraft(root, { collection: 'concepts', record: entity });
  const readingDir = path.join(root, 'private/reading-records');
  await mkdir(readingDir, { recursive: true });
  const file = path.join(readingDir, 'paper-a.json');
  const record = {
    paperId: 'paper-a',
    entries: [{ id: 'entry-a', page: 'method', text: 'Reading thought', createdAt: '2026-09-24' }],
  };
  await writeFile(file, JSON.stringify(record));
  return { root, store, draft, file, record };
}

test('backup and restore cover drafts and reading records while retaining unlisted newer files', async (t) => {
  const { root, store, draft, file, record } = await fixture(t);
  const backup = await backupWorkspace(root);
  const manifest = JSON.parse(await readFile(path.join(backup.path, 'manifest.json'), 'utf8'));
  assert.equal(manifest.formatVersion, 2);
  assert.deepEqual(manifest.auxiliaryFiles.map((f) => f.folder).sort(), [
    'draft-inbox',
    'reading-records',
  ]);
  await saveDraft(root, { ...draft, record: { ...entity, note: 'Later draft' } });
  await writeFile(file, JSON.stringify({ ...record, entries: [] }));
  const newer = path.join(path.dirname(file), 'paper-b.json');
  await writeFile(newer, JSON.stringify({ paperId: 'paper-b', entries: [] }));
  const restored = await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: store.revision,
    write: true,
  });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), record);
  assert.equal((await listDrafts(root))[0].record.note, undefined);
  assert.ok(await readFile(newer));
  const safety = path.join(restored.safetyBackup.path, 'reading-records/paper-a.json');
  assert.deepEqual(JSON.parse(await readFile(safety, 'utf8')).entries, []);
});

test('tampered auxiliary snapshot is rejected before modifying live data; legacy backups preserve auxiliary files', async (t) => {
  const { root, store, file, record } = await fixture(t);
  const backup = await backupWorkspace(root);
  await writeFile(
    path.join(backup.path, 'reading-records/paper-a.json'),
    JSON.stringify({ ...record, entries: [] }),
  );
  await assert.rejects(
    () =>
      restoreWorkspace(root, {
        backupId: backup.backupId,
        expectedRevision: store.revision,
        write: true,
      }),
    /checksum mismatch/,
  );
  assert.equal((await readWorkspace(root)).revision, store.revision);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), record);
  await writeFile(
    path.join(backup.path, 'manifest.json'),
    JSON.stringify({ backupId: backup.backupId, documentIds: [] }),
  );
  await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: store.revision,
    write: true,
  });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), record);
});

test('draft writes and backups participate in the shared workspace lock', async (t) => {
  const { root } = await fixture(t);
  await withWorkspaceLock(root, async () => {
    await assert.rejects(
      () => saveDraft(root, { collection: 'concepts', record: entity }),
      (e) => e.status === 409,
    );
    await assert.rejects(
      () => backupWorkspace(root),
      (e) => e.status === 409,
    );
  });
});
