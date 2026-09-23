import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { loadAuthoritativeData, validateData, publicProjection, collections } from './data.mjs';
import { readWorkspace } from '../services/workspace-store.mjs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const allowed = [
  '.agents',
  'src',
  'scripts',
  'schemas',
  'content',
  'templates',
  'services',
  'tests',
  'docs',
  '.github',
  'artifacts/screenshots',
  'artifacts/evaluation/retrieval-round1.json',
  'artifacts/evaluation/retrieval-final.json',
  'README.md',
  'AGENTS.md',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'package.json',
  'package-lock.json',
  'index.html',
  'site.config.json',
  'vite.config.js',
  'playwright.config.js',
  'playwright.v2.config.js',
  '.env.example',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
];
const excluded = new Set([
  'generated',
  'node_modules',
  '.git',
  'private',
  'dist',
  'tmp',
  'test-results',
  'playwright-report',
]);
export async function createSourcePackage(root) {
  const data = await loadAuthoritativeData(root),
    errors = validateData(data);
  const local = await readWorkspace(root, { optional: true });
  if (errors.length) throw Error(errors.join('\n'));
  const files = {};
  async function collect(relative) {
    const full = path.join(root, relative),
      stat = await lstat(full);
    if (stat.isSymbolicLink()) throw Error(`Refusing symlink in source bundle: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(full)).sort())
        if (!excluded.has(name)) await collect(path.join(relative, name));
    } else if (stat.isFile()) {
      if (path.basename(relative).startsWith('.env') && path.basename(relative) !== '.env.example')
        throw Error('Private environment file blocked');
      files['paper-knowledge-hub/' + relative.split(path.sep).join('/')] = new Uint8Array(
        await readFile(full),
      );
    }
  }
  for (const item of allowed) {
    if (item === 'content' || (local && item === 'artifacts/screenshots')) continue;
    try {
      await collect(item);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  const published = publicProjection(data),
    manifest = {};
  for (const collection of collections)
    for (const record of published[collection]) {
      const relative = `content/${collection}/${record.id}.json`,
        bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
      files['paper-knowledge-hub/' + relative] = bytes;
      if (record.demo) manifest[relative] = createHash('sha256').update(bytes).digest('hex');
    }
  files['paper-knowledge-hub/content/demo-manifest.json'] = Buffer.from(
    JSON.stringify({ files: manifest }, null, 2) + '\n',
  );
  const bytes = zipSync(files, { level: 6 }),
    readback = unzipSync(bytes);
  if (Object.keys(readback).length !== Object.keys(files).length)
    throw Error('Archive readback mismatch');
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  const output = 'artifacts/paper-knowledge-hub-source.zip';
  await writeFile(path.join(root, output), bytes);
  return { output, fileCount: Object.keys(files).length, bytes: bytes.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await createSourcePackage(process.cwd())));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
