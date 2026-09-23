import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safePrivate, readWorkspace, putRecord } from './workspace-store.mjs';
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
    if (previous.status === 'applied') throw fail('已应用草稿不可覆盖，请创建新草稿');
  }
  const baseRevision = input.baseRevision || previous?.baseRevision || current.revision;
  // Validate against the captured revision; updating text cannot silently rebase a stale draft.
  await putRecord(root, {
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
export async function applyDraft(root, { id, expectedRevision }) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw fail('Invalid draft ID');
  const dir = await folder(root),
    file = path.join(dir, id + '.json'),
    item = JSON.parse(await readFile(file, 'utf8'));
  if (item.status === 'applied') throw fail('此草稿已应用，请打开记录查看', 409);
  if (expectedRevision !== item.baseRevision)
    throw fail('草稿基于旧版本；请对照当前记录重新合并并创建草稿', 409);
  const result = await putRecord(root, {
    collection: item.collection,
    record: item.record,
    expectedRevision: item.baseRevision,
    write: true,
    createOnly: item.createOnly,
  });
  item.status = 'applied';
  item.appliedRevision = result.revision;
  item.updatedAt = new Date().toISOString();
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(item, null, 2), { mode: 0o600 });
  await rename(tmp, file);
  return { revision: result.revision, draft: item };
}
