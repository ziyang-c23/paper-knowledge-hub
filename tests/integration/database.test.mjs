import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initializeWorkspace,
  readWorkspace,
  putRecord,
  backupWorkspace,
  restoreWorkspace,
} from '../../services/workspace-store.mjs';
import { saveDatabase, patchPapers } from '../../services/database-store.mjs';
import { defaultDatabase } from '../../src/lib/database.mjs';
import { publicProjection } from '../../scripts/data.mjs';
import { createLocalServer } from '../../services/local-server.mjs';
async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-database-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content/papers'), { recursive: true });
  for (const id of ['a', 'b'])
    await writeFile(
      path.join(root, 'content/papers', id + '.json'),
      JSON.stringify({
        schemaVersion: 1,
        id,
        title: 'Synthetic ' + id,
        year: 2026,
        authors: [],
        url: 'https://example.org/' + id,
        visibility: 'public',
        note: 'KEEP-' + id,
      }),
    );
  await initializeWorkspace(root, { write: true });
  return root;
}
test('legacy workspace gets additive database configuration; typed values, saved views and complete backups persist', async (t) => {
  const root = await setup(t),
    initial = await readWorkspace(root),
    database = defaultDatabase();
  assert.equal(initial.database, undefined);
  database.properties = [
    { id: 'score', name: '私有评分', type: 'number' },
    { id: 'date', name: '阅读日期', type: 'date' },
    { id: 'related', name: '关联', type: 'relation' },
  ];
  database.views[0].columns.push('custom:score');
  const configured = await saveDatabase(root, { database, expectedRevision: initial.revision });
  const updated = await patchPapers(root, {
    expectedRevision: configured.revision,
    changes: [
      { id: 'a', changes: { customProperties: { score: 0, date: '2026-09-25', related: ['b'] } } },
      { id: 'b', changes: { status: 'reading' } },
    ],
  });
  assert.equal(updated.dataset.papers[0].note, 'KEEP-a');
  assert.equal((await readWorkspace(root)).dataset.papers[0].customProperties.score, 0);
  const backup = await backupWorkspace(root);
  const changed = await patchPapers(root, {
    expectedRevision: updated.revision,
    changes: [{ id: 'a', changes: { customProperties: { score: 11 } } }],
  });
  const restored = await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: changed.revision,
    write: true,
  });
  assert.deepEqual(restored.database, database);
  assert.equal(restored.dataset.papers[0].customProperties.score, 0);
  assert.equal(restored.dataset.papers[1].status, 'reading');
});
test('invalid batch is all-or-nothing; stale revisions and unsafe fields cannot overwrite current records', async (t) => {
  const root = await setup(t),
    initial = await readWorkspace(root);
  await assert.rejects(() =>
    patchPapers(root, {
      expectedRevision: initial.revision,
      changes: [
        { id: 'a', changes: { status: 'reading' } },
        { id: 'b', changes: { year: 'bad' } },
      ],
    }),
  );
  assert.equal((await readWorkspace(root)).revision, initial.revision);
  await assert.rejects(() =>
    patchPapers(root, {
      expectedRevision: initial.revision,
      changes: [{ id: 'a', changes: { note: 'OVERWRITE' } }],
    }),
  );
  const next = await patchPapers(root, {
    expectedRevision: initial.revision,
    changes: [{ id: 'a', changes: { status: 'reading' } }],
  });
  await assert.rejects(
    () =>
      patchPapers(root, {
        expectedRevision: initial.revision,
        changes: [{ id: 'a', changes: { status: 'reviewed' } }],
      }),
    (e) => e.status === 409,
  );
  assert.equal((await readWorkspace(root)).revision, next.revision);
});
test('property definitions and values cannot drift; ordinary record writes also validate custom types', async (t) => {
  const root = await setup(t),
    initial = await readWorkspace(root),
    database = defaultDatabase();
  database.properties = [
    { id: 'priority', name: 'Priority', type: 'select', options: ['High', 'Low'] },
  ];
  const configured = await saveDatabase(root, { database, expectedRevision: initial.revision });
  const next = await patchPapers(root, {
    expectedRevision: configured.revision,
    changes: [{ id: 'a', changes: { customProperties: { priority: 'High' } } }],
  });
  for (const props of [
    [],
    [{ id: 'priority', name: 'Priority', type: 'text' }],
    [{ id: 'priority', name: 'Priority', type: 'select', options: ['Low'] }],
  ])
    await assert.rejects(
      () =>
        saveDatabase(root, {
          database: { ...database, properties: props },
          expectedRevision: next.revision,
        }),
      (e) => e.status === 422,
    );
  for (const write of [true, false])
    await assert.rejects(
      () =>
        putRecord(root, {
          collection: 'papers',
          record: { ...next.dataset.papers[0], customProperties: { priority: 'Impossible' } },
          expectedRevision: next.revision,
          write,
        }),
      (e) => e.status === 422,
    );
  assert.equal((await readWorkspace(root)).revision, next.revision);
});
test('public mutations require consent and custom values never enter public projections', async (t) => {
  const root = await setup(t),
    initial = await readWorkspace(root),
    database = defaultDatabase();
  database.properties = [{ id: 'secret', name: 'PRIVATE-PROPERTY', type: 'text' }];
  const configured = await saveDatabase(root, { database, expectedRevision: initial.revision });
  const published = await putRecord(root, {
    collection: 'papers',
    record: {
      ...configured.dataset.papers[0],
      visibility: 'public',
      customProperties: { secret: 'PRIVATE-VALUE' },
    },
    expectedRevision: configured.revision,
    publishConsent: true,
  });
  await assert.rejects(
    () =>
      patchPapers(root, {
        expectedRevision: published.revision,
        changes: [{ id: 'a', changes: { status: 'reading' } }],
      }),
    (e) => e.status === 403,
  );
  const changed = await patchPapers(root, {
    expectedRevision: published.revision,
    publishConsent: true,
    changes: [{ id: 'a', changes: { status: 'reading' } }],
  });
  assert.doesNotMatch(
    JSON.stringify(publicProjection(changed.dataset)),
    /PRIVATE-VALUE|customProperties|PRIVATE-PROPERTY/,
  );
});
test('new API endpoints obey loopback token boundaries and persisted views survive a fresh server', async (t) => {
  const root = await setup(t);
  async function server() {
    const app = createLocalServer({ root, config: { configured: false } });
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    t.after(
      () =>
        new Promise((resolve) => {
          app.closeAllConnections();
          app.close(resolve);
        }),
    );
    return 'http://127.0.0.1:' + app.address().port;
  }
  const url = await server(),
    state = await (await fetch(url + '/api/workspace')).json();
  assert.equal(state.database.views.length, 4);
  assert.equal(
    (
      await fetch(url + '/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: state.database, expectedRevision: state.revision }),
      })
    ).status,
    403,
  );
  state.database.views[0].name = 'Saved research view';
  const response = await fetch(url + '/api/database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': state.csrfToken },
    body: JSON.stringify({ database: state.database, expectedRevision: state.revision }),
  });
  assert.equal(response.status, 200);
  const url2 = await server();
  assert.equal(
    (await (await fetch(url2 + '/api/workspace')).json()).database.views[0].name,
    'Saved research view',
  );
  assert.equal(
    JSON.parse(await readFile(path.join(root, 'private/workspace.json'))).database.views[0].name,
    'Saved research view',
  );
});
