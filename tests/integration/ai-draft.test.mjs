import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeWorkspace, readWorkspace } from '../../services/workspace-store.mjs';
const run = promisify(execFile),
  script = path.resolve('scripts/ai-draft.mjs');
test('AI draft CLI validates an envelope without writing, then applies only with a fresh revision and create-only', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pkh-ai-draft-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content/concepts'), { recursive: true });
  const initial = await initializeWorkspace(root, { write: true });
  const draft = path.join(root, 'draft.json');
  await writeFile(
    draft,
    JSON.stringify({
      collection: 'concepts',
      record: {
        schemaVersion: 1,
        id: 'ai-person',
        kind: 'person',
        title: 'AI Draft Person',
        visibility: 'private',
        lifecycle: 'active',
        aliases: [],
        relatedIds: [],
        sources: [],
      },
      sourceMaterial: [
        { kind: 'official', url: 'https://example.org/profile', support: 'identity only' },
      ],
      uncertainties: ['Affiliation not checked'],
      candidateRelations: [],
    }),
  );
  const dry = await run(
    process.execPath,
    [script, draft, '--collection', 'concepts', '--create-only'],
    { cwd: root },
  );
  const output = JSON.parse(dry.stdout);
  assert.equal(output.mode, 'validated');
  assert.equal((await readWorkspace(root)).dataset.concepts.length, 0);
  const applied = await run(
    process.execPath,
    [
      script,
      draft,
      '--collection',
      'concepts',
      '--create-only',
      '--revision',
      initial.revision,
      '--write',
    ],
    { cwd: root },
  );
  assert.equal(JSON.parse(applied.stdout).mode, 'applied');
  const saved = await readWorkspace(root);
  assert.equal(saved.dataset.concepts[0].title, 'AI Draft Person');
  await assert.rejects(() =>
    run(
      process.execPath,
      [
        script,
        draft,
        '--collection',
        'concepts',
        '--create-only',
        '--revision',
        saved.revision,
        '--write',
      ],
      { cwd: root },
    ),
  );
  assert.equal(
    (await readFile(path.join(root, 'private/workspace.json'), 'utf8')).includes(
      'Affiliation not checked',
    ),
    false,
  );
});
