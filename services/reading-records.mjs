import { mkdir, readFile, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safePrivate, readWorkspace, withWorkspaceLock } from './workspace-store.mjs';
const fail = (message, status = 422) => Object.assign(Error(message), { status });
const stableId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function paperKey(paperId) {
  if (typeof paperId !== 'string' || paperId.length > 120 || !stableId.test(paperId))
    throw fail('Invalid paper ID');
}
export async function readReadingRecords(root, paperId) {
  paperKey(paperId);
  const store = await readWorkspace(root);
  if (!store.dataset.papers.some((p) => p.id === paperId)) throw fail('Paper not found', 404);
  try {
    const file = path.join(await safePrivate(root), 'reading-records', paperId + '.json');
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (
      value.paperId !== paperId ||
      !Array.isArray(value.entries) ||
      typeof value.revision !== 'string'
    )
      throw fail('Reading records are invalid');
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { paperId, revision: 'empty', entries: [] };
  }
}
export async function saveReadingRecords(root, { paperId, entries, expectedRevision }) {
  paperKey(paperId);
  return withWorkspaceLock(root, async () => {
    const current = await readReadingRecords(root, paperId);
    if (expectedRevision !== current.revision)
      throw fail('阅读记录已更新，请重新读取后合并。', 409);
    if (!Array.isArray(entries) || entries.length > 2000) throw fail('Invalid reading records');
    const store = await readWorkspace(root),
      dir = await safePrivate(root);
    const ids = new Set(),
      allowed = new Set([
        'id',
        'text',
        'page',
        'createdAt',
        'documentId',
        'pageIndex',
        'quote',
        'section',
        'paperId',
      ]);
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        Object.keys(entry).some((key) => !allowed.has(key))
      )
        throw fail('Invalid reading record fields');
      if (
        !['string', 'number'].includes(typeof entry.id) ||
        String(entry.id).length > 120 ||
        ids.has(String(entry.id))
      )
        throw fail('Reading record IDs must be unique');
      ids.add(String(entry.id));
      if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 100000)
        throw fail('Reading record needs text');
      if (
        typeof entry.page !== 'string' ||
        entry.page.length > 80 ||
        typeof entry.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.createdAt))
      )
        throw fail('Invalid reading record date or page');
      if (entry.paperId !== undefined && entry.paperId !== paperId)
        throw fail('Reading record paper mismatch');
      for (const field of ['quote', 'section'])
        if (
          entry[field] !== undefined &&
          (typeof entry[field] !== 'string' ||
            entry[field].length > (field === 'quote' ? 50000 : 1000))
        )
          throw fail('Invalid ' + field);
      if (entry.documentId === undefined && entry.pageIndex !== undefined)
        throw fail('pageIndex requires documentId');
      if (entry.documentId !== undefined) {
        if (
          typeof entry.documentId !== 'string' ||
          !/^doc-[a-f0-9]+$/.test(entry.documentId) ||
          !store.documentIds.includes(entry.documentId)
        )
          throw fail('Document is not attached');
        const doc = JSON.parse(
          await readFile(path.join(dir, 'documents', entry.documentId + '.json'), 'utf8'),
        );
        if (doc.paperId !== paperId || doc.id !== entry.documentId)
          throw fail('Document must belong to this paper');
        if (
          !Number.isInteger(entry.pageIndex) ||
          entry.pageIndex < 1 ||
          entry.pageIndex > doc.pageCount ||
          !doc.pages?.some((page) => page.pageIndex === entry.pageIndex)
        )
          throw fail('Document page does not exist');
      }
    }
    const value = { paperId, revision: randomUUID(), updatedAt: new Date().toISOString(), entries };
    const folder = path.join(dir, 'reading-records');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const temporary = path.join(folder, '.' + randomUUID() + '.tmp');
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(value, null, 2));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path.join(folder, paperId + '.json'));
    } finally {
      await rm(temporary, { force: true });
    }
    return value;
  });
}
