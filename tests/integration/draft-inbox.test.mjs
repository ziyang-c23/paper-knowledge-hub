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

test('review accepts only selected fields and preserves unselected human content', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-inbox-fields-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  store = await putRecord(root, {
    collection: 'concepts',
    record: { ...entity, title: 'Human title', note: 'Human note', description: 'Old description' },
    expectedRevision: store.revision,
  });
  const draft = await saveDraft(root, {
    collection: 'concepts',
    record: { ...entity, title: 'AI title', note: 'AI note', description: 'New description' },
  });
  for (const acceptedFields of [[], ['id'], ['schemaVersion'], ['invented'], 'note'])
    await assert.rejects(
      () => applyDraft(root, { id: draft.id, expectedRevision: store.revision, acceptedFields }),
      (e) => e.status === 400,
    );
  await applyDraft(root, {
    id: draft.id,
    expectedRevision: store.revision,
    acceptedFields: ['description'],
  });
  const saved = (await readWorkspace(root)).dataset.concepts[0];
  assert.equal(saved.title, 'Human title');
  assert.equal(saved.note, 'Human note');
  assert.equal(saved.description, 'New description');
  assert.deepEqual((await listDrafts(root))[0].acceptedFields, ['description']);
});

test('new drafts require whole-record acceptance and stale selected fields cannot overwrite updates', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-inbox-stale-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  const newDraft = await saveDraft(root, { collection: 'concepts', record: entity });
  await assert.rejects(
    () =>
      applyDraft(root, {
        id: newDraft.id,
        expectedRevision: store.revision,
        acceptedFields: ['title'],
      }),
    (e) => e.status === 400,
  );
  await applyDraft(root, { id: newDraft.id, expectedRevision: store.revision });
  store = await readWorkspace(root);
  const draft = await saveDraft(root, {
    collection: 'concepts',
    record: { ...entity, note: 'AI note' },
  });
  await putRecord(root, {
    collection: 'concepts',
    record: { ...entity, note: 'Later human note' },
    expectedRevision: store.revision,
  });
  await assert.rejects(
    () =>
      applyDraft(root, {
        id: draft.id,
        expectedRevision: store.revision,
        acceptedFields: ['note'],
      }),
    (e) => e.status === 409,
  );
  assert.equal((await readWorkspace(root)).dataset.concepts[0].note, 'Later human note');
});

test('chapter acceptance preserves other chapters and isolates paper records and stale drafts', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-inbox-sections-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  const paper = (id, note) => ({
    schemaVersion: 1,
    id,
    title: id,
    year: 2024,
    authors: [],
    url: 'https://example.org/' + id,
    visibility: 'private',
    note,
  });
  const originalA =
    '## 概览\n\nA overview\n\n## 方法\n\nA method\n\n````js\n```\n## fake-heading\n````\n\n## 结果\n\nA result\n';
  const originalB = '## 概览\n\nB overview\n\n## 方法\n\nB method\n\n## 结果\n\nB result\n';
  for (const record of [paper('paper-a', originalA), paper('paper-b', originalB)])
    store = await putRecord(root, {
      collection: 'papers',
      record,
      expectedRevision: store.revision,
    });
  const first = await saveDraft(root, {
    collection: 'papers',
    record: paper(
      'paper-a',
      originalA.replace('A method', 'New A method').replace('A result', 'New A result'),
    ),
  });
  const second = await saveDraft(root, {
    collection: 'papers',
    record: paper(
      'paper-b',
      originalB.replace('B method', 'New B method').replace('B result', 'New B result'),
    ),
  });
  await assert.rejects(
    () =>
      applyDraft(root, {
        id: first.id,
        expectedRevision: store.revision,
        acceptedFields: ['note'],
        acceptedNoteSections: ['fake-heading'],
      }),
    (e) => e.status === 400,
  );
  await applyDraft(root, {
    id: first.id,
    expectedRevision: store.revision,
    acceptedFields: ['note'],
    acceptedNoteSections: ['方法'],
  });
  let current = await readWorkspace(root);
  assert.equal(
    current.dataset.papers.find((p) => p.id === 'paper-a').note,
    originalA.replace('A method', 'New A method'),
  );
  assert.equal(current.dataset.papers.find((p) => p.id === 'paper-b').note, originalB);
  await assert.rejects(
    () =>
      applyDraft(root, {
        id: second.id,
        expectedRevision: current.revision,
        acceptedFields: ['note'],
        acceptedNoteSections: ['结果'],
      }),
    (e) => e.status === 409,
  );
  const freshB = await saveDraft(root, { collection: 'papers', record: second.record });
  await applyDraft(root, {
    id: freshB.id,
    expectedRevision: current.revision,
    acceptedFields: ['note'],
    acceptedNoteSections: ['结果'],
  });
  current = await readWorkspace(root);
  assert.equal(
    current.dataset.papers.find((p) => p.id === 'paper-a').note,
    originalA.replace('A method', 'New A method'),
  );
  assert.equal(
    current.dataset.papers.find((p) => p.id === 'paper-b').note,
    originalB.replace('B result', 'New B result'),
  );
});

test('new and deleted note chapters require explicit selection; unrelated fields remain untouched', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-inbox-add-sections-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  const original = {
    schemaVersion: 1,
    id: 'paper-c',
    title: 'Paper C',
    authors: [],
    year: 2024,
    url: 'https://example.org/c',
    visibility: 'private',
    note: 'Personal introduction\n\n## 方法\n\nMethod\n\n## 旧实验\n\nRetain until selected\n',
  };
  store = await putRecord(root, {
    collection: 'papers',
    record: original,
    expectedRevision: store.revision,
  });
  const proposal = {
    ...original,
    title: 'Unaccepted title',
    note: 'Changed introduction\n\n## 方法\n\nChanged method\n\n## 新实验\n\nNew experiment\n',
  };
  const draft = await saveDraft(root, { collection: 'papers', record: proposal });
  await assert.rejects(
    () =>
      applyDraft(root, {
        id: draft.id,
        expectedRevision: store.revision,
        acceptedFields: ['title'],
        acceptedNoteSections: ['方法'],
      }),
    (e) => e.status === 400,
  );
  await applyDraft(root, {
    id: draft.id,
    expectedRevision: store.revision,
    acceptedFields: ['note'],
    acceptedNoteSections: ['新实验', '旧实验'],
  });
  const saved = (await readWorkspace(root)).dataset.papers[0];
  assert.equal(saved.title, original.title);
  assert.equal(
    saved.note,
    'Personal introduction\n\n## 方法\n\nMethod\n\n## 新实验\n\nNew experiment\n',
  );
});
