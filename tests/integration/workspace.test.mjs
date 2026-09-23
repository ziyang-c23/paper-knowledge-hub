import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { importData } from '../../scripts/import.mjs';
import {
  initializeWorkspace,
  readWorkspace,
  putRecord,
  backupWorkspace,
  restoreWorkspace,
  withWorkspaceLock,
  commitWorkspace,
  listHistory,
  readHistory,
} from '../../services/workspace-store.mjs';
import { createLocalServer } from '../../services/local-server.mjs';
import { buildData, publicProjection } from '../../scripts/data.mjs';
import { createSourcePackage } from '../../scripts/package.mjs';
const seed = {
  schemaVersion: 1,
  id: 'paper-a',
  title: 'Original seed title',
  year: 2026,
  authors: ['Author'],
  url: 'https://example.org',
  visibility: 'public',
  note: 'ORIGINAL-SEED-CONTENT',
  arxiv: '2601.12345',
};
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pkh-workspace-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content/papers'), { recursive: true });
  await writeFile(path.join(root, 'content/papers/paper-a.json'), JSON.stringify(seed));
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), '<html><head></head><body>app</body></html>');
  return root;
}
async function server(t, root, options = {}) {
  const app = createLocalServer({ root, config: { configured: false }, ...options });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        app.closeAllConnections();
        app.close(resolve);
      }),
  );
  return { app, url: `http://127.0.0.1:${app.address().port}` };
}
test('explicit initialization is private, idempotent and records survive process-independent rereads', async (t) => {
  const root = await setup(t);
  assert.equal((await initializeWorkspace(root)).dryRun, true);
  assert.equal(await readWorkspace(root, { optional: true }), null);
  const initial = await initializeWorkspace(root, { write: true });
  assert.equal(initial.dataset.papers[0].visibility, 'private');
  const record = {
    ...initial.dataset.papers[0],
    note: 'PRIVATE-EDIT',
    personalAnalysis: 'SECRET-ANALYSIS',
    status: 'reviewed',
  };
  const saved = await putRecord(root, {
    collection: 'papers',
    record,
    expectedRevision: initial.revision,
  });
  assert.equal((await readWorkspace(root)).dataset.papers[0].note, 'PRIVATE-EDIT');
  assert.equal((await initializeWorkspace(root, { write: true })).revision, saved.revision);
  assert.match((await importData(root, record, { write: true })).failures[0], /authoritative/);
  await assert.rejects(
    () => putRecord(root, { collection: 'papers', record, expectedRevision: initial.revision }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () =>
      putRecord(root, {
        collection: 'papers',
        record: { ...record, id: 'duplicate', arxiv: '2601.12345v2' },
        expectedRevision: saved.revision,
      }),
    (e) => e.status === 409 && e.details.existingId === 'paper-a',
  );
  await assert.rejects(
    () =>
      putRecord(root, {
        collection: 'papers',
        record: { ...record, id: 'duplicate', arxiv: undefined, title: 'Original SEED title!' },
        expectedRevision: saved.revision,
      }),
    (e) => e.status === 409,
  );
});

test('ordinary writes keep bounded local history snapshots and expose inspection without attachment leakage', async (t) => {
  const root = await setup(t);
  const initial = await initializeWorkspace(root, { write: true });
  const changed = await putRecord(root, {
    collection: 'papers',
    record: {
      ...initial.dataset.papers[0],
      note: 'HISTORY-ONE',
      personalAnalysis: 'PRIVATE-HISTORY',
    },
    expectedRevision: initial.revision,
  });
  const history = await listHistory(root);
  assert.equal(history.length, 1);
  assert.equal(history[0].revision, initial.revision);
  const snapshot = await readHistory(root, initial.revision);
  assert.equal(snapshot.store.dataset.papers[0].note, initial.dataset.papers[0].note);
  assert.equal(snapshot.store.dataset.papers[0].personalAnalysis, undefined);
  assert.equal((await readWorkspace(root)).revision, changed.revision);
  const { url } = await server(t, root);
  const response = await fetch(url + '/api/history');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).history[0].revision, initial.revision);
  assert.equal((await fetch(url + '/api/history/' + initial.revision)).status, 200);
  assert.equal((await fetch(url + '/api/history/' + 'a'.repeat(64))).status, 404);
});
test('publishing is explicit, archived dependencies are excluded, and source ZIP never repackages stale seeds', async (t) => {
  const root = await setup(t),
    initial = await initializeWorkspace(root, { write: true });
  const record = {
    ...initial.dataset.papers[0],
    note: 'PUBLIC-EDIT',
    personalAnalysis: 'PRIVATE-MARKER',
    privateNotes: 'PRIVATE-LEGACY-MARKER',
    visibility: 'public',
  };
  await assert.rejects(
    () => putRecord(root, { collection: 'papers', record, expectedRevision: initial.revision }),
    (e) => e.status === 403,
  );
  const published = await putRecord(root, {
    collection: 'papers',
    record,
    expectedRevision: initial.revision,
    publishConsent: true,
  });
  const data = await buildData(root);
  assert.equal(data.papers[0].note, 'PUBLIC-EDIT');
  assert.equal(data.papers[0].personalAnalysis, undefined);
  await createSourcePackage(root);
  const zip = unzipSync(
      await readFile(path.join(root, 'artifacts/paper-knowledge-hub-source.zip')),
    ),
    all = Object.values(zip)
      .map((b) => Buffer.from(b).toString())
      .join('\n');
  assert.match(all, /PUBLIC-EDIT/);
  assert.doesNotMatch(all, /PRIVATE-MARKER|PRIVATE-LEGACY-MARKER|ORIGINAL-SEED-CONTENT/);
  const archived = await putRecord(root, {
    collection: 'papers',
    record: { ...record, lifecycle: 'archived' },
    expectedRevision: published.revision,
    publishConsent: true,
  });
  assert.equal(publicProjection(archived.dataset).papers.length, 0);
  await createSourcePackage(root);
  const archive = unzipSync(
    await readFile(path.join(root, 'artifacts/paper-knowledge-hub-source.zip')),
  );
  assert.equal(archive['paper-knowledge-hub/content/papers/paper-a.json'], undefined);
});
test('backup restore preserves all private records and attachment snapshots with a fresh revision', async (t) => {
  const root = await setup(t),
    initial = await initializeWorkspace(root, { write: true });
  const backup = await backupWorkspace(root);
  const changed = await putRecord(root, {
    collection: 'papers',
    record: { ...initial.dataset.papers[0], note: 'CHANGED' },
    expectedRevision: initial.revision,
  });
  const dry = await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: changed.revision,
  });
  assert.equal(dry.dryRun, true);
  assert.equal((await readWorkspace(root)).revision, changed.revision);
  const restored = await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: changed.revision,
    write: true,
  });
  assert.equal(restored.dataset.papers[0].note, seed.note);
  assert.notEqual(restored.revision, initial.revision);
  assert.ok(restored.safetyBackup.backupId);
  await assert.rejects(
    () =>
      restoreWorkspace(root, {
        backupId: backup.backupId,
        expectedRevision: changed.revision,
        write: true,
      }),
    (e) => e.status === 409,
  );
  await withWorkspaceLock(root, async () =>
    assert.rejects(
      () => backupWorkspace(root),
      (e) => e.status === 409,
    ),
  );
});
test('loopback API rejects hostile Host, Origin, fetch context, missing tokens and stale writes; refresh sees saved state', async (t) => {
  const root = await setup(t);
  await initializeWorkspace(root, { write: true });
  const { app, url } = await server(t, root),
    boot = await fetch(url + '/api/workspace'),
    initial = await boot.json();
  assert.equal(boot.headers.get('cache-control'), 'no-store');
  assert.equal(initial.dataset.scope, 'local');
  assert.match(await (await fetch(url)).text(), /__PKH_LOCAL__=true/);
  for (const headers of [
    { Host: 'evil.example' },
    { Origin: 'https://evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const status = await new Promise((resolve, reject) => {
      const request = http.get(url + '/api/workspace', { headers }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  const payload = {
    collection: 'papers',
    record: { ...initial.dataset.papers[0], note: 'LOCAL-SAVE' },
    expectedRevision: initial.revision,
  };
  assert.equal(
    (
      await fetch(url + '/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    ).status,
    403,
  );
  const response = await fetch(url + '/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': initial.csrfToken },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await (await fetch(url + '/api/workspace')).json()).dataset.papers[0].note,
    'LOCAL-SAVE',
  );
  assert.equal(
    (
      await fetch(url + '/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': initial.csrfToken },
        body: JSON.stringify(payload),
      })
    ).status,
    409,
  );
  await new Promise((resolve) => {
    app.closeAllConnections();
    app.close(resolve);
  });
  const restarted = await server(t, root),
    reread = await (await fetch(restarted.url + '/api/workspace')).json();
  assert.equal(reread.dataset.papers[0].note, 'LOCAL-SAVE');
  assert.notEqual(reread.csrfToken, initial.csrfToken);
});
test('private directory symlinks are rejected before read or write', async (t) => {
  const root = await setup(t),
    outside = await mkdtemp(path.join(tmpdir(), 'pkh-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(root, 'private'));
  await assert.rejects(
    () => initializeWorkspace(root, { write: true }),
    (e) => e.status === 403,
  );
});

test('backup restores attachment index, original files and site configuration without exposing PDFs to public build', async (t) => {
  const root = await setup(t),
    initial = await initializeWorkspace(root, { write: true }),
    id = 'doc-' + 'a'.repeat(32),
    second = 'doc-' + 'b'.repeat(32);
  await mkdir(path.join(root, 'private/documents'), { recursive: true });
  for (const docId of [id, second]) {
    await writeFile(
      path.join(root, 'private/documents', docId + '.pdf'),
      '%PDF-synthetic-backup-fixture-' + docId,
    );
    await writeFile(
      path.join(root, 'private/documents', docId + '.json'),
      JSON.stringify({
        id: docId,
        paperId: 'paper-a',
        pages: [{ pageIndex: 1, text: 'PRIVATE-PDF-TEXT' }],
      }),
    );
  }
  const indexed = await withWorkspaceLock(root, () =>
    commitWorkspace(root, { ...initial, documentIds: [id] }),
  );
  await writeFile(path.join(root, 'site.config.json'), JSON.stringify({ title: 'First config' }));
  const backup = await backupWorkspace(root);
  const changed = await withWorkspaceLock(root, () =>
    commitWorkspace(root, { ...indexed, documentIds: [id, second] }),
  );
  await writeFile(path.join(root, 'site.config.json'), JSON.stringify({ title: 'Changed config' }));
  const restored = await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: changed.revision,
    write: true,
  });
  assert.deepEqual(restored.documentIds, [id]);
  assert.equal(
    JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8')).title,
    'First config',
  );
  assert.match(await readFile(path.join(root, 'private/documents', id + '.pdf'), 'utf8'), /%PDF/);
  const { url } = await server(t, root),
    current = await (await fetch(url + '/api/workspace')).json();
  assert.deepEqual(
    current.documents.map((d) => d.id),
    [id],
  );
  assert.equal((await fetch(url + '/api/documents/' + second + '/file')).status, 404);
  const pdf = await fetch(url + '/api/documents/' + id + '/file');
  assert.equal(pdf.headers.get('cache-control'), 'no-store');
  assert.match(await pdf.text(), /%PDF/);
  await createSourcePackage(root);
  const archive = unzipSync(
    await readFile(path.join(root, 'artifacts/paper-knowledge-hub-source.zip')),
  );
  assert(Object.keys(archive).every((key) => !key.includes('/private/')));
  assert.doesNotMatch(
    Object.values(archive)
      .map((bytes) => Buffer.from(bytes).toString())
      .join(''),
    /PRIVATE-PDF-TEXT/,
  );
});

test('local model boundary requires token and sends only verified selected-public evidence (mock)', async (t) => {
  const root = await setup(t),
    initial = await initializeWorkspace(root, { write: true });
  const dataset = structuredClone(initial.dataset);
  dataset.papers[0] = {
    ...dataset.papers[0],
    visibility: 'public',
    note: 'memory public note',
    personalAnalysis: 'SECRET-PERSONAL',
  };
  dataset.evidence = [
    {
      schemaVersion: 1,
      id: 'public-evidence',
      paperId: 'paper-a',
      visibility: 'public',
      kind: 'source',
      status: 'verified',
      text: 'memory PUBLIC-EVIDENCE',
    },
    {
      schemaVersion: 1,
      id: 'private-evidence',
      paperId: 'paper-a',
      visibility: 'private',
      kind: 'source',
      status: 'verified',
      text: 'memory SECRET-EVIDENCE',
    },
    {
      schemaVersion: 1,
      id: 'unverified-evidence',
      paperId: 'paper-a',
      visibility: 'public',
      kind: 'source',
      status: 'unverified',
      text: 'memory UNVERIFIED-EVIDENCE',
    },
  ];
  await withWorkspaceLock(root, () => commitWorkspace(root, { ...initial, dataset }));
  const sent = [];
  const { url } = await server(t, root, {
    config: {
      configured: true,
      key: 'MOCK-NOT-A-REAL-KEY',
      baseURL: 'https://model.invalid',
      model: 'mock',
    },
    fetchImpl: async (_url, opts) => {
      sent.push(opts.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Memory [public-evidence]' } }] }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  const boot = await (await fetch(url + '/api/workspace')).json(),
    payload = { question: 'memory', consent: true };
  assert.equal(
    (
      await fetch(url + '/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    ).status,
    403,
  );
  assert.equal(sent.length, 0);
  const response = await fetch(url + '/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': boot.csrfToken },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /PUBLIC-EVIDENCE/);
  assert.doesNotMatch(sent[0], /SECRET-PERSONAL|SECRET-EVIDENCE|UNVERIFIED-EVIDENCE/);
});
test('progressive empty authors and reviewed citation edges are accepted without implying adoption', async (t) => {
  const root = await setup(t),
    initial = await initializeWorkspace(root, { write: true });
  const p = await putRecord(root, {
    collection: 'papers',
    record: { ...initial.dataset.papers[0], authors: [] },
    expectedRevision: initial.revision,
  });
  assert.deepEqual(p.dataset.papers[0].authors, []);
  const concept = await putRecord(root, {
    collection: 'concepts',
    record: {
      schemaVersion: 1,
      id: 'concept-a',
      title: 'Cited concept',
      kind: 'concept',
      visibility: 'private',
    },
    expectedRevision: p.revision,
  });
  const ev = await putRecord(root, {
    collection: 'evidence',
    record: {
      schemaVersion: 1,
      id: 'citation-ev',
      paperId: 'paper-a',
      kind: 'source',
      text: 'The paper cites this concept.',
      status: 'verified',
      visibility: 'private',
    },
    expectedRevision: concept.revision,
  });
  const edge = await putRecord(root, {
    collection: 'relations',
    record: {
      schemaVersion: 1,
      id: 'citation-edge',
      source: 'paper-a',
      target: 'concept-a',
      type: 'cites',
      evidenceIds: ['citation-ev'],
      origin: 'source',
      status: 'approved',
      visibility: 'private',
    },
    expectedRevision: ev.revision,
  });
  assert.equal(edge.dataset.relations[0].type, 'cites');
});
test('evidence document binding validates attachment ownership and existing file page without proving the claim', async (t) => {
  const root = await setup(t),
    initial = await initializeWorkspace(root, { write: true });
  const id = 'doc-' + 'c'.repeat(32),
    orphan = 'doc-' + 'd'.repeat(32),
    other = 'doc-' + 'e'.repeat(32);
  await mkdir(path.join(root, 'private/documents'), { recursive: true });
  for (const [docId, paperId] of [
    [id, 'paper-a'],
    [orphan, 'paper-a'],
    [other, 'different-paper'],
  ])
    await writeFile(
      path.join(root, 'private/documents', docId + '.json'),
      JSON.stringify({
        id: docId,
        paperId,
        pageCount: 2,
        pages: [
          { pageIndex: 1, text: 'Synthetic file page' },
          { pageIndex: 2, text: 'Another synthetic page' },
        ],
      }),
    );
  const indexed = await withWorkspaceLock(root, () =>
    commitWorkspace(root, { ...initial, documentIds: [id, other] }),
  );
  const evidence = {
    schemaVersion: 1,
    id: 'bound-evidence',
    paperId: 'paper-a',
    kind: 'source',
    text: 'This claim still needs manual verification.',
    status: 'unverified',
    visibility: 'private',
  };
  for (const binding of [
    { pageIndex: 1 },
    { documentId: orphan, pageIndex: 1 },
    { documentId: other, pageIndex: 1 },
    { documentId: id },
    { documentId: id, pageIndex: 0 },
    { documentId: id, pageIndex: 3 },
    { documentId: id, pageIndex: 1.5 },
  ]) {
    await assert.rejects(
      () =>
        putRecord(root, {
          collection: 'evidence',
          record: { ...evidence, ...binding },
          expectedRevision: indexed.revision,
        }),
      (e) => e.status === 422,
    );
    assert.equal((await readWorkspace(root)).revision, indexed.revision);
  }
  const saved = await putRecord(root, {
    collection: 'evidence',
    record: { ...evidence, documentId: id, pageIndex: 2 },
    expectedRevision: indexed.revision,
  });
  assert.equal(saved.dataset.evidence[0].pageIndex, 2);
  assert.equal(saved.dataset.evidence[0].status, 'unverified');
  const unbound = await putRecord(root, {
    collection: 'evidence',
    record: { ...evidence, locator: 'External source section' },
    expectedRevision: saved.revision,
  });
  assert.equal(unbound.dataset.evidence[0].documentId, undefined);
});
