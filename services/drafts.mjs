import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  safePrivate,
  readWorkspace,
  putRecordUnlocked,
  withWorkspaceLock,
} from './workspace-store.mjs';
import { mergeNoteSections } from '../src/lib/note-sections.mjs';
const groups = ['papers', 'concepts', 'topics', 'evidence', 'relations'];
const fail = (m, status = 400) => Object.assign(Error(m), { status });
async function folder(root) {
  const dir = path.join(await safePrivate(root), 'draft-inbox');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
export async function listDrafts(root) {
  const dir = await folder(root);
  return (
    await Promise.all(
      (await readdir(dir))
        .filter((n) => /^[a-f0-9-]+\.json$/.test(n))
        .map(async (n) => JSON.parse(await readFile(path.join(dir, n), 'utf8'))),
    )
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveDraft(root, input) {
  return withWorkspaceLock(root, () => saveDraftUnlocked(root, input));
}
// Internal composition point; caller holds withWorkspaceLock.
export async function saveDraftUnlocked(root, input) {
  if (!groups.includes(input.collection) || !input.record || typeof input.record !== 'object')
    throw fail('草稿需要 collection 和完整 record');
  if (input.record.visibility !== 'private')
    throw fail('草稿箱仅接收私有记录；公开审查请在记录编辑页完成');
  const current = await readWorkspace(root),
    dir = await folder(root);
  let previous;
  if (input.id) {
    if (!/^[a-f0-9-]{36}$/.test(input.id)) throw fail('Invalid draft ID');
    previous = JSON.parse(await readFile(path.join(dir, input.id + '.json'), 'utf8'));
    if (previous.status !== 'pending') throw fail('已应用或取消草稿不可覆盖，请创建新草稿');
  }
  const baseRevision = input.baseRevision || previous?.baseRevision || current.revision;
  // Validate against the captured revision; updating text cannot silently rebase a stale draft.
  await putRecordUnlocked(root, {
    collection: input.collection,
    record: input.record,
    expectedRevision: baseRevision,
    write: false,
    createOnly: input.createOnly ?? previous?.createOnly ?? false,
  });
  const item = {
    id: previous?.id || randomUUID(),
    collection: input.collection,
    record: input.record,
    baseRevision,
    baseRecord:
      previous?.baseRecord ??
      current.dataset[input.collection].find((x) => x.id === input.record.id) ??
      null,
    sourceMaterial: input.sourceMaterial || previous?.sourceMaterial || [],
    uncertainties: input.uncertainties || previous?.uncertainties || [],
    createOnly: input.createOnly ?? previous?.createOnly ?? false,
    status: 'pending',
    updatedAt: new Date().toISOString(),
  };
  const tmp = path.join(dir, item.id + '.tmp');
  await writeFile(tmp, JSON.stringify(item, null, 2), { mode: 0o600 });
  await rename(tmp, path.join(dir, item.id + '.json'));
  return item;
}
export async function applyDraft(root, input) {
  return withWorkspaceLock(root, () => applyDraftUnlocked(root, input));
}
// Internal composition point; caller holds withWorkspaceLock.
export async function applyDraftUnlocked(
  root,
  { id, expectedRevision, acceptedFields, acceptedNoteSections },
) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw fail('Invalid draft ID');
  const dir = await folder(root),
    file = path.join(dir, id + '.json'),
    item = JSON.parse(await readFile(file, 'utf8'));
  if (item.status !== 'pending') throw fail('此草稿已应用或已取消，不能再次应用', 409);
  if (expectedRevision !== item.baseRevision)
    throw fail('草稿基于旧版本；请对照当前记录重新合并并创建草稿', 409);
  let record = item.record;
  if (acceptedNoteSections !== undefined && !Array.isArray(acceptedFields))
    throw fail('笔记章节选择必须同时选择 note 字段');
  if (acceptedNoteSections !== undefined && !acceptedFields.includes('note'))
    throw fail('笔记章节选择必须包含 note 字段');
  if (acceptedFields !== undefined) {
    if (!item.baseRecord) throw fail('新记录必须完整接收，不能只应用部分字段');
    if (
      !Array.isArray(acceptedFields) ||
      !acceptedFields.length ||
      acceptedFields.some(
        (key) =>
          typeof key !== 'string' ||
          ['id', 'schemaVersion', '__proto__', 'constructor', 'prototype'].includes(key) ||
          (!Object.hasOwn(item.record, key) && !Object.hasOwn(item.baseRecord, key)),
      )
    )
      throw fail('请选择有效的可修改字段；记录标识不可更改');
    record = structuredClone(item.baseRecord);
    for (const key of new Set(acceptedFields)) {
      if (Object.hasOwn(item.record, key)) record[key] = structuredClone(item.record[key]);
      else delete record[key];
    }
  }
  if (acceptedNoteSections !== undefined) {
    if (!item.baseRecord || !Array.isArray(acceptedNoteSections) || !acceptedNoteSections.length)
      throw fail('请选择至少一个笔记章节');
    try {
      record.note = mergeNoteSections(item.baseRecord.note, item.record.note, acceptedNoteSections);
    } catch (error) {
      throw fail(error.message);
    }
  }
  if (
    item.baseRecord &&
    (record.id !== item.baseRecord.id || record.schemaVersion !== item.baseRecord.schemaVersion)
  )
    throw fail('草稿不能更改记录标识或 schemaVersion');
  const result = await putRecordUnlocked(root, {
    collection: item.collection,
    record,
    expectedRevision: item.baseRevision,
    write: true,
    createOnly: item.createOnly,
  });
  item.status = 'applied';
  item.acceptedFields = acceptedFields ?? null;
  item.acceptedNoteSections = acceptedNoteSections ?? null;
  item.appliedRevision = result.revision;
  item.updatedAt = new Date().toISOString();
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(item, null, 2), { mode: 0o600 });
  await rename(tmp, file);
  return { revision: result.revision, draft: item };
}
