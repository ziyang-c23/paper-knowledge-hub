import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile),
  script = fileURLToPath(new URL('../../scripts/export.mjs', import.meta.url));
test('CLI exports real Awesome README bullets and defaults to comparison Markdown', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paper-export-'));
  try {
    await mkdir(path.join(root, 'content/papers'), { recursive: true });
    await writeFile(
      path.join(root, 'content/papers/paper-a.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'paper-a',
        title: 'Paper [A]',
        authors: ['First Author'],
        year: 2026,
        url: 'https://example.org/paper-a',
        visibility: 'public',
      }),
    );
    const awesome = await exec(
      process.execPath,
      [script, '--format', 'awesome', '--ids', 'paper-a'],
      { cwd: root },
    );
    assert.match(awesome.stdout, /^- \*\*\[Paper \\\[A\\\]/);
    assert.match(awesome.stdout, /https:\/\/example.org\/paper-a/);
    assert.match(awesome.stdout, /First Author/);
    const markdown = await exec(process.execPath, [script, '--ids', 'paper-a'], { cwd: root });
    assert.match(markdown.stdout, /^\| 维度 \|/);
    assert.match(markdown.stdout, /未知 \/ 未提供/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
