import {
  readFile,
  open,
  mkdir,
  readdir,
  lstat,
  rename,
  rm,
  copyFile,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  collections,
  loadData,
  validateData,
  normalizeDOI,
  normalizeArxiv,
} from '../scripts/data.mjs';
import { defaultDatabase, validateDatabase } from '../src/lib/database.mjs';
const fail = (message, status = 400, details) => Object.assign(Error(message), { status, details });
const stableId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export async function safePrivate(root) {
  const base = await realpath(root),
    dir = path.join(base, 'private');
  async function inspect(p) {
    let info;
    try {
      info = await lstat(p);
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    if (info.isSymbolicLink()) throw fail('Symlinks are forbidden in the private workspace', 403);
    if (info.isDirectory()) for (const name of await readdir(p)) await inspect(path.join(p, name));
  }
  await inspect(dir);
  return dir;
}
export async function withWorkspaceLock(root, action) {
  const dir = await safePrivate(root);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, '.workspace-lock');
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (e) {
    if (e.code === 'EEXIST')
      throw fail('Workspace is busy. Retry after the current operation finishes.', 409);
    throw e;
  }
  try {
    return await action(dir);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
export async function readWorkspace(root, { optional = false } = {}) {
  const dir = await safePrivate(root);
  let raw;
  try {
    raw = await readFile(path.join(dir, 'workspace.json'), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      if (optional) return null;
      throw fail('Local workspace is not initialized. Run npm run workspace -- init --write.', 503);
    }
    throw e;
  }
  const store = JSON.parse(raw),
    errors = [
      ...validateData(store.dataset),
      ...validateDatabase(store.database || defaultDatabase(), store.dataset),
    ];
  if (
    store.storeVersion !== 2 ||
    !/^[a-f0-9]{64}$/.test(store.revision) ||
    errors.length ||
    !Array.isArray(store.documentIds) ||
    store.documentIds.some((id) => !/^doc-[a-f0-9]{32}$/.test(id))
  )
    throw fail('Invalid workspace: ' + errors.join('; '), 500);
  return store;
}
async function atomic(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + '\n');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, file);
  } finally {
    await rm(tmp, { force: true });
  }
}
export async function commitWorkspace(root, store) {
  const dir = await safePrivate(root),
    errors = [
      ...validateData(store.dataset),
      ...validateDatabase(store.database || defaultDatabase(), store.dataset),
    ];
  if (errors.length) throw fail(errors.join('; '), 422, errors);
  // Keep a bounded, local-only trail of the previous authoritative state. This is
  // intentionally separate from backups: it is for inspection and diffing, while
  // backups also include PDF originals and site configuration for full recovery.
  try {
    const currentFile = path.join(dir, 'workspace.json'),
      previous = JSON.parse(await readFile(currentFile, 'utf8'));
    if (previous?.revision && /^[a-f0-9]{64}$/.test(previous.revision)) {
      const historyDir = path.join(dir, 'history');
      await mkdir(historyDir, { recursive: true, mode: 0o700 });
      await atomic(path.join(historyDir, previous.revision + '.json'), {
        capturedAt: new Date().toISOString(),
        store: previous,
      });
      const entries = await readdir(historyDir, { withFileTypes: true }),
        files = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const info = await lstat(path.join(historyDir, entry.name));
        files.push({ path: path.join(historyDir, entry.name), mtimeMs: info.mtimeMs });
      }
      files.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const item of files.slice(0, Math.max(0, files.length - 100)))
        await rm(item.path, { force: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const next = {
    ...store,
    updatedAt: new Date().toISOString(),
    revision: createHash('sha256')
      .update(JSON.stringify(store.dataset) + randomUUID())
      .digest('hex'),
  };
  await atomic(path.join(dir, 'workspace.json'), next);
  return next;
}
export async function listHistory(root) {
  const dir = await safePrivate(root),
    historyDir = path.join(dir, 'history');
  try {
    const entries = await readdir(historyDir, { withFileTypes: true }),
      snapshots = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
      try {
        const snapshot = JSON.parse(await readFile(path.join(historyDir, entry.name), 'utf8')),
          revision = entry.name.slice(0, -5);
        if (snapshot?.store?.revision !== revision) continue;
        snapshots.push({
          revision,
          capturedAt: snapshot.capturedAt,
          updatedAt: snapshot.store.updatedAt || null,
          papers: snapshot.store.dataset?.papers?.length || 0,
          entities: snapshot.store.dataset?.concepts?.length || 0,
        });
      } catch {
        // Ignore a partial or manually removed history entry.
      }
    }
    return snapshots.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
export async function readHistory(root, revision) {
  if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))
    throw fail('Invalid history revision');
  const dir = await safePrivate(root);
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(path.join(dir, 'history', revision + '.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw fail('History snapshot not found', 404);
    throw error;
  }
  if (snapshot?.store?.revision !== revision) throw fail('Invalid history snapshot', 422);
  const errors = [
    ...validateData(snapshot.store.dataset),
    ...validateDatabase(snapshot.store.database || defaultDatabase(), snapshot.store.dataset),
  ];
  if (errors.length) throw fail('Invalid history snapshot: ' + errors.join('; '), 422);
  return snapshot;
}
export function requireRevision(store, expectedRevision) {
  if (typeof expectedRevision !== 'string' || store.revision !== expectedRevision)
    throw fail('Workspace changed or revision is missing. Reload before saving.', 409, {
      currentRevision: store.revision,
    });
}
export async function initializeWorkspace(root, { write = false } = {}) {
  const existing = await readWorkspace(root, { optional: true });
  if (existing) return { ...existing, existing: true };
  const dataset = await loadData(root);
  for (const kind of collections)
    dataset[kind] = dataset[kind].map((x) => ({
      ...x,
      visibility: 'private',
      ...(kind === 'papers' ? { lifecycle: 'active' } : {}),
    }));
  const draft = { storeVersion: 2, dataset, documentIds: [], createdAt: new Date().toISOString() };
  if (!write) return { ...draft, dryRun: true };
  return withWorkspaceLock(root, async () => {
    const second = await readWorkspace(root, { optional: true });
    return second || commitWorkspace(root, draft);
  });
}
function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}
export async function putRecord(
  root,
  {
    collection,
    record,
    expectedRevision,
    publishConsent = false,
    write = true,
    createOnly = false,
  },
) {
  return withWorkspaceLock(root, async () => {
    const store = await readWorkspace(root);
    requireRevision(store, expectedRevision);
    if (!collections.includes(collection) || !record || !stableId.test(record.id || ''))
      throw fail('Valid collection and stable record ID required');
    const previous = store.dataset[collection].find((x) => x.id === record.id);
    if (createOnly && previous)
      throw fail('Record ID already exists. Open the existing record to edit.', 409, {
        existingId: record.id,
      });
    if (
      record.visibility === 'public' &&
      JSON.stringify(previous) !== JSON.stringify(record) &&
      publishConsent !== true
    )
      throw fail('Explicit publishConsent is required to publish or change a public record', 403);
    if (collection === 'papers') {
      for (const p of store.dataset.papers) {
        if (p.id === record.id) continue;
        if (
          (record.doi && p.doi && normalizeDOI(record.doi) === normalizeDOI(p.doi)) ||
          (record.arxiv && p.arxiv && normalizeArxiv(record.arxiv) === normalizeArxiv(p.arxiv)) ||
          normalizeTitle(record.title) === normalizeTitle(p.title)
        )
          throw fail(`Duplicate paper already exists: ${p.id}. Edit the existing record.`, 409, {
            existingId: p.id,
          });
      }
    }
    const next = structuredClone(store);
    const index = next.dataset[collection].findIndex((x) => x.id === record.id);
    if (index >= 0) next.dataset[collection][index] = record;
    else next.dataset[collection].push(record);
    const errors = [
      ...validateData(next.dataset),
      ...validateDatabase(next.database || defaultDatabase(), next.dataset),
    ];
    if (errors.length) throw fail(errors.join('; '), 422, errors);
    if (collection === 'evidence') {
      if (record.pageIndex !== undefined && record.documentId === undefined)
        throw fail('Evidence pageIndex requires an attached documentId', 422);
      if (record.documentId !== undefined) {
        if (!store.documentIds.includes(record.documentId))
          throw fail('Evidence documentId is not attached to this workspace', 422);
        let document;
        try {
          document = JSON.parse(
            await readFile(
              path.join(await safePrivate(root), 'documents', record.documentId + '.json'),
              'utf8',
            ),
          );
        } catch {
          throw fail('Evidence document metadata is unavailable or invalid', 422);
        }
        if (document.id !== record.documentId || document.paperId !== record.paperId)
          throw fail('Evidence document must belong to the same paper', 422);
        if (
          !Number.isInteger(record.pageIndex) ||
          record.pageIndex < 1 ||
          !Number.isInteger(document.pageCount) ||
          record.pageIndex > document.pageCount ||
          !Array.isArray(document.pages) ||
          !document.pages.some((page) => page.pageIndex === record.pageIndex)
        )
          throw fail(
            'Evidence pageIndex must be an existing one-based file page in this document',
            422,
          );
      }
    }
    if (!write) return { ...next, dryRun: true };
    return commitWorkspace(root, next);
  });
}
async function backupUnlocked(root, store) {
  const dir = await safePrivate(root),
    backupId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
    dest = path.join(dir, 'backups', backupId);
  await mkdir(dest, { recursive: true, mode: 0o700 });
  await atomic(path.join(dest, 'workspace.json'), store);
  const documentIds = store.documentIds || [];
  if (documentIds.length) {
    await mkdir(path.join(dest, 'documents'), { mode: 0o700 });
    for (const id of documentIds) {
      if (!stableId.test(id)) throw fail('Invalid document ID');
      for (const suffix of ['.json', '.pdf'])
        await copyFile(
          path.join(dir, 'documents', id + suffix),
          path.join(dest, 'documents', id + suffix),
        );
    }
  }
  try {
    if ((await lstat(path.join(root, 'site.config.json'))).isSymbolicLink())
      throw fail('Site configuration symlinks are not supported', 403);
    await copyFile(path.join(root, 'site.config.json'), path.join(dest, 'site.config.json'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await atomic(path.join(dest, 'manifest.json'), {
    backupId,
    createdAt: new Date().toISOString(),
    documentIds,
  });
  return { backupId, path: dest };
}
export async function backupWorkspace(root) {
  return withWorkspaceLock(root, async () => backupUnlocked(root, await readWorkspace(root)));
}
export async function listBackups(root) {
  const dir = await safePrivate(root);
  try {
    const backups = [];
    for (const entry of await readdir(path.join(dir, 'backups'), { withFileTypes: true }))
      if (entry.isDirectory()) {
        try {
          const manifest = JSON.parse(
            await readFile(path.join(dir, 'backups', entry.name, 'manifest.json'), 'utf8'),
          );
          backups.push({ backupId: entry.name, createdAt: manifest.createdAt });
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
      }
    return backups.sort((a, b) => b.backupId.localeCompare(a.backupId));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
export async function restoreWorkspace(root, { backupId, expectedRevision, write = false }) {
  if (typeof backupId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(backupId))
    throw fail('Invalid backup ID');
  return withWorkspaceLock(root, async (dir) => {
    const current = await readWorkspace(root);
    requireRevision(current, expectedRevision);
    const source = path.join(dir, 'backups', backupId),
      restore = JSON.parse(await readFile(path.join(source, 'workspace.json'), 'utf8'));
    await readFile(path.join(source, 'manifest.json'), 'utf8');
    const errors = [
      ...validateData(restore.dataset),
      ...validateDatabase(restore.database || defaultDatabase(), restore.dataset),
    ];
    if (
      restore.storeVersion !== 2 ||
      errors.length ||
      !Array.isArray(restore.documentIds) ||
      restore.documentIds.some((id) => !/^doc-[a-f0-9]{32}$/.test(id))
    )
      throw fail('Invalid backup: ' + errors.join('; '), 422);
    if (!write) return { backupId, dryRun: true, dataset: restore.dataset };
    // Verify all attachments before creating a new current revision. Files are immutable,
    // restored IDs select the exact attachment snapshot while newer blobs remain recoverable.
    for (const id of restore.documentIds || []) {
      if (!stableId.test(id)) throw fail('Invalid backup document ID');
      for (const suffix of ['.json', '.pdf'])
        await readFile(path.join(source, 'documents', id + suffix));
    }
    const safetyBackup = await backupUnlocked(root, current);
    if (restore.documentIds?.length)
      await mkdir(path.join(dir, 'documents'), { recursive: true, mode: 0o700 });
    for (const id of restore.documentIds || [])
      for (const suffix of ['.json', '.pdf'])
        await copyFile(
          path.join(source, 'documents', id + suffix),
          path.join(dir, 'documents', id + suffix),
        );
    try {
      const config = JSON.parse(await readFile(path.join(source, 'site.config.json'), 'utf8'));
      await atomic(path.join(root, 'site.config.json'), config);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const next = await commitWorkspace(root, { ...restore, createdAt: current.createdAt });
    return { ...next, safetyBackup };
  });
}
