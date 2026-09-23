import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importData } from '../../scripts/import.mjs';
import { loadData, buildData, emptyData } from '../../scripts/data.mjs';
const paper = {
  schemaVersion: 1,
  id: 'user-paper',
  title: 'User paper',
  authors: [],
  year: 2026,
  url: 'https://example.org/paper',
  visibility: 'public',
  arxiv: '2601.12345v1',
};
test('daily loop: dry run, write, idempotent import, rebuild and no-overwrite conflict', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paper-import-'));
  try {
    let r = await importData(root, paper);
    assert.equal(r.additions.length, 1);
    assert.equal((await loadData(root)).papers.length, 0);
    r = await importData(root, paper, { write: true });
    assert.deepEqual(r.failures, []);
    r = await importData(root, paper, { write: true });
    assert.equal(r.duplicates.length, 1);
    r = await importData(root, { ...paper, title: 'Changed' }, { write: true });
    assert.equal(r.conflicts.length, 1);
    assert.equal((await loadData(root)).papers[0].title, 'User paper');
    await buildData(root);
    const data = JSON.parse(await readFile(path.join(root, 'src/generated/public.json')));
    assert.equal(data.papers.length, 1);
    r = await importData(
      root,
      { ...paper, id: 'different-id', arxiv: '2601.12345v2' },
      { write: true },
    );
    assert.equal(r.conflicts.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('invalid batch is atomic and private input fails before publication', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paper-import-'));
  try {
    let r = await importData(
      root,
      { ...emptyData(), papers: [paper, { ...paper, id: 'bad', topics: ['missing'] }] },
      { write: true },
    );
    assert(r.failures.length);
    assert.equal((await loadData(root)).papers.length, 0);
    r = await importData(root, { ...paper, visibility: 'private' }, { write: true });
    assert(r.failures.length);
    assert.equal((await loadData(root)).papers.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('import refuses unsupported bundle versions and unknown envelope fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paper-import-'));
  try {
    for (const input of [
      { ...emptyData(), schemaVersion: 2, papers: [paper] },
      { ...emptyData(), extra: 'unknown', papers: [paper] },
    ]) {
      const result = await importData(root, input, { write: true });
      assert(result.failures.length);
      assert.equal((await loadData(root)).papers.length, 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('public source load and import both refuse nonempty privateNotes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paper-import-'));
  try {
    const incoming = { ...paper, privateNotes: 'SENSITIVE_LOCAL_NOTE' };
    const result = await importData(root, incoming, { write: true });
    assert.match(result.failures.join('\n'), /privateNotes must live/);
    assert.equal((await loadData(root)).papers.length, 0);
    await mkdir(path.join(root, 'content/papers'), { recursive: true });
    await writeFile(path.join(root, 'content/papers/user-paper.json'), JSON.stringify(incoming));
    await assert.rejects(() => loadData(root), /privateNotes must live/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
