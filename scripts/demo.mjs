import { readFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadData, validateData, collections } from './data.mjs';
// Seed identity alone is insufficient: only exact checked-in seed bytes may be removed.
try {
  const root = process.cwd(),
    data = await loadData(root),
    manifest = JSON.parse(await readFile(path.join(root, 'content/demo-manifest.json'), 'utf8')),
    targets = [];
  for (const kind of collections)
    for (const item of data[kind])
      if (item.demo) {
        const relative = `content/${kind}/${item.id}.json`,
          bytes = await readFile(path.join(root, relative)),
          hash = createHash('sha256').update(bytes).digest('hex');
        if (manifest.files?.[relative] !== hash)
          throw Error(
            `Refusing modified/unregistered demo file ${relative}; remove demo flag to retain it`,
          );
        targets.push(relative);
      }
  const after = { ...data };
  for (const k of collections) after[k] = data[k].filter((x) => !x.demo);
  const errors = validateData(after);
  if (errors.length)
    throw Error(
      `Demo files are referenced by retained user data; resolve references first:\n${errors.join('\n')}`,
    );
  if (!process.argv.includes('--write'))
    console.log(JSON.stringify({ mode: 'dry-run', remove: targets }, null, 2));
  else {
    const backup = path.join(root, `tmp/demo-clear-${Date.now()}`);
    await mkdir(backup, { recursive: true });
    const moved = [];
    try {
      for (const rel of targets) {
        const dest = path.join(backup, rel);
        await mkdir(path.dirname(dest), { recursive: true });
        await rename(path.join(root, rel), dest);
        moved.push({ rel, dest });
      }
    } catch (e) {
      for (const { rel, dest } of moved.reverse()) await rename(dest, path.join(root, rel));
      throw e;
    }
    console.log(`Cleared ${targets.length} unchanged demo files. Recoverable backup: ${backup}`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
