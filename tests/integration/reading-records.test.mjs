import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initializeWorkspace,
  putRecord,
  commitWorkspace,
  withWorkspaceLock,
} from '../../services/workspace-store.mjs';
import { readReadingRecords, saveReadingRecords } from '../../services/reading-records.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-reading-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  for (const id of ['reading-a', 'reading-b'])
    store = await putRecord(root, {
      collection: 'papers',
      expectedRevision: store.revision,
      record: {
        schemaVersion: 1,
        id,
        title: id,
        year: 2025,
        authors: [],
        url: 'https://example.com/' + id,
        visibility: 'private',
        topics: [],
        status: 'reading',
      },
    });
  return { root, store };
}
const record = {
  id: 'record-1',
  text: 'Which condition matters?',
  page: '2',
  createdAt: '2026-09-24T00:00:00.000Z',
};

test('reading records persist independently and reject stale saves under workspace lock', async (t) => {
  const { root } = await fixture(t);
  assert.deepEqual((await readReadingRecords(root, 'reading-a')).entries, []);
  const saved = await saveReadingRecords(root, {
    paperId: 'reading-a',
    expectedRevision: 'empty',
    entries: [record],
  });
  assert.deepEqual(await readReadingRecords(root, 'reading-a'), saved);
  assert.deepEqual((await readReadingRecords(root, 'reading-b')).entries, []);
  await assert.rejects(
    () =>
      saveReadingRecords(root, { paperId: 'reading-a', expectedRevision: 'empty', entries: [] }),
    (e) => e.status === 409,
  );
  await withWorkspaceLock(root, async () => {
    await assert.rejects(
      () =>
        saveReadingRecords(root, {
          paperId: 'reading-a',
          expectedRevision: saved.revision,
          entries: [],
        }),
      (e) => e.status === 409,
    );
  });
  assert.deepEqual((await readReadingRecords(root, 'reading-a')).entries, [record]);
});

test('reading record references require a PDF owned by the same paper and a real page', async (t) => {
  let { root, store } = await fixture(t);
  const docId = 'doc-' + 'a'.repeat(32);
  await mkdir(path.join(root, 'private', 'documents'), { recursive: true });
  await writeFile(
    path.join(root, 'private', 'documents', docId + '.json'),
    JSON.stringify({
      id: docId,
      paperId: 'reading-a',
      pageCount: 2,
      pages: [{ pageIndex: 1 }, { pageIndex: 2 }],
    }),
  );
  await commitWorkspace(root, { ...store, documentIds: [docId] });
  const located = { ...record, documentId: docId, pageIndex: 2, quote: 'Original text' };
  await assert.rejects(
    () =>
      saveReadingRecords(root, {
        paperId: 'reading-b',
        expectedRevision: 'empty',
        entries: [located],
      }),
    /belong to this paper/,
  );
  await assert.rejects(
    () =>
      saveReadingRecords(root, {
        paperId: 'reading-a',
        expectedRevision: 'empty',
        entries: [{ ...located, pageIndex: 3 }],
      }),
    /page does not exist/,
  );
  await assert.rejects(
    () =>
      saveReadingRecords(root, {
        paperId: 'reading-a',
        expectedRevision: 'empty',
        entries: [{ ...record, pageIndex: 1 }],
      }),
    /requires documentId/,
  );
  const saved = await saveReadingRecords(root, {
    paperId: 'reading-a',
    expectedRevision: 'empty',
    entries: [located],
  });
  assert.deepEqual(saved.entries, [located]);
});
