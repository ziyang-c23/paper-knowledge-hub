import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile),
  script = fileURLToPath(new URL('../../scripts/demo.mjs', import.meta.url));
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paper-demo-'));
  const item = {
      schemaVersion: 1,
      id: 'demo-topic',
      title: 'Demo',
      visibility: 'public',
      demo: true,
    },
    file = 'content/topics/demo-topic.json',
    bytes = JSON.stringify(item, null, 2) + '\n';
  await mkdir(path.join(root, 'content/topics'), { recursive: true });
  await writeFile(path.join(root, file), bytes);
  await writeFile(
    path.join(root, 'content/demo-manifest.json'),
    JSON.stringify({ files: { [file]: createHash('sha256').update(bytes).digest('hex') } }),
  );
  return { root, file, item };
}
test('demo clear defaults dry-run and exact seeds move to recoverable backup', async () => {
  const { root, file } = await setup();
  try {
    const preview = await exec(process.execPath, [script], { cwd: root });
    assert.match(preview.stdout, /dry-run/);
    await readFile(path.join(root, file));
    const run = await exec(process.execPath, [script, '--write'], { cwd: root });
    assert.match(run.stdout, /Cleared 1/);
    await assert.rejects(() => readFile(path.join(root, file)), { code: 'ENOENT' });
    const backup = run.stdout.trim().split('Recoverable backup: ')[1];
    await readFile(path.join(backup, file));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('demo clear refuses modified seed and user references without removing anything', async () => {
  const { root, file, item } = await setup();
  try {
    await writeFile(path.join(root, file), JSON.stringify({ ...item, title: 'Edited' }));
    await assert.rejects(
      () => exec(process.execPath, [script, '--write'], { cwd: root }),
      /Refusing modified/,
    );
    await writeFile(path.join(root, file), JSON.stringify(item, null, 2) + '\n');
    await mkdir(path.join(root, 'content/papers'), { recursive: true });
    await writeFile(
      path.join(root, 'content/papers/user-paper.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'user-paper',
        title: 'User',
        year: 2026,
        authors: [],
        url: 'https://example.org',
        topics: ['demo-topic'],
        visibility: 'public',
      }),
    );
    await assert.rejects(
      () => exec(process.execPath, [script, '--write'], { cwd: root }),
      /referenced by retained user data/,
    );
    await readFile(path.join(root, file));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
