import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadAuthoritativeData, publicProjection, collections, validateData } from './data.mjs';

const root = process.cwd();
const data = loadAuthoritativeData ? await loadAuthoritativeData(root) : null;
const errors = validateData(data);
if (errors.length) throw Error(errors.join('\n'));
const published = publicProjection(data);
for (const collection of collections) {
  const dir = path.join(root, 'content', collection);
  await mkdir(dir, { recursive: true });
  for (const file of await readdir(dir)) if (file.endsWith('.json')) await rm(path.join(dir, file));
  for (const record of published[collection])
    await writeFile(path.join(dir, record.id + '.json'), JSON.stringify(record, null, 2) + '\n');
}
await writeFile(
  path.join(root, 'content', 'demo-manifest.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scope: 'public projection',
      counts: Object.fromEntries(collections.map((key) => [key, published[key].length])),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    scope: 'public projection',
    counts: Object.fromEntries(collections.map((key) => [key, published[key].length])),
  }),
);
