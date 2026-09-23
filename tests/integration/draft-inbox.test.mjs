import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeWorkspace, readWorkspace, putRecord } from '../../services/workspace-store.mjs';
import { saveDraft, listDrafts, applyDraft } from '../../services/drafts.mjs';
const entity = {
  schemaVersion: 1,
  id: 'draft-method',
  title: 'Draft method',
  kind: 'benchmark',
  visibility: 'private',
};
test('staging keeps main data unchanged; edited draft applies once and readback survives reload', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-inbox-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content'));
  const before = await initializeWorkspace(root, { write: true });
  const d = await saveDraft(root, {
    collection: 'concepts',
    record: entity,
    sourceMaterial: ['fixture'],
  });
  assert.equal((await readWorkspace(root)).revision, before.revision);
  assert.equal((await listDrafts(root)).length, 1);
  await saveDraft(root, { ...d, record: { ...entity, note: 'Reviewed content' } });
  const result = await applyDraft(root, { id: d.id, expectedRevision: before.revision });
  assert.notEqual(result.revision, before.revision);
  assert.equal((await readWorkspace(root)).dataset.concepts[0].note, 'Reviewed content');
  assert.equal((await listDrafts(root))[0].status, 'applied');
  await assert.rejects(() => applyDraft(root, { id: d.id, expectedRevision: before.revision }));
});
test('stale drafts cannot overwrite later saves or silently rebase on edit; public drafts rejected', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-inbox-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content'));
  const before = await initializeWorkspace(root, { write: true });
  const d = await saveDraft(root, { collection: 'concepts', record: entity });
  const latest = await putRecord(root, {
    collection: 'concepts',
    record: { ...entity, note: 'Human update' },
    expectedRevision: before.revision,
  });
  await assert.rejects(
    () => applyDraft(root, { id: d.id, expectedRevision: latest.revision }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => saveDraft(root, { ...d, record: { ...entity, note: 'Stale change' } }),
    (e) => e.status === 409,
  );
  assert.equal((await readWorkspace(root)).dataset.concepts[0].note, 'Human update');
  await assert.rejects(() =>
    saveDraft(root, { collection: 'concepts', record: { ...entity, visibility: 'public' } }),
  );
});
