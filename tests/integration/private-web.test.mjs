import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initializeWorkspace,
  commitWorkspace,
  backupWorkspace,
  restoreWorkspace,
  readWorkspace,
} from '../../services/workspace-store.mjs';
import {
  createPrivateServer,
  hashPrivatePassword,
  privateConfiguration,
} from '../../services/private-server.mjs';
import { saveReadingRecords } from '../../services/reading-records.mjs';

const password = 'synthetic-private-web-password';
const passwordHash = await hashPrivatePassword(password);
const authorization = 'Basic ' + Buffer.from('reader:' + password).toString('base64');
const documentId = 'doc-' + 'a'.repeat(32);
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pkh-private-web-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content/papers'), { recursive: true });
  await writeFile(
    path.join(root, 'content/papers/example.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'example',
      title: 'Private fixture',
      year: 2026,
      authors: [],
      url: 'https://example.org',
      visibility: 'public',
      note: 'PRIVATE-NOTE-MARKER',
    }),
  );
  const store = await initializeWorkspace(root, { write: true });
  await mkdir(path.join(root, 'private/documents'), { recursive: true });
  await writeFile(
    path.join(root, 'private/documents', documentId + '.pdf'),
    '%PDF-1.7\nSYNTHETIC-PRIVATE-PDF',
  );
  await writeFile(
    path.join(root, 'private/documents', documentId + '.json'),
    JSON.stringify({ id: documentId, paperId: 'example', pages: [], pageCount: 1 }),
  );
  await commitWorkspace(root, { ...store, documentIds: [documentId] });
  for (const folder of ['draft-inbox', 'ai-tasks']) {
    await mkdir(path.join(root, 'private', folder), { recursive: true });
    await writeFile(
      path.join(root, 'private', folder, '11111111-1111-1111-1111-111111111111.json'),
      JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        status: folder === 'draft-inbox' ? 'pending' : 'queued',
        type: 'explanation',
        collection: 'papers',
        baseRevision: store.revision,
        record: { ...store.dataset.papers[0], visibility: 'private' },
        updatedAt: '2026-09-24',
        marker: folder,
      }),
    );
  }
  await mkdir(path.join(root, 'dist/assets'), { recursive: true });
  await writeFile(
    path.join(root, 'dist/index.html'),
    '<html><head></head><body>fixture</body></html>',
  );
  await writeFile(path.join(root, 'dist/assets/app.js'), '/* fixture asset */');
  const server = createPrivateServer({
    root,
    config: { origin: 'https://research.example.org', username: 'reader', passwordHash },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, { headers, body, ...options } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        base + url,
        {
          ...options,
          headers: {
            Host: 'research.example.org',
            'X-Forwarded-Proto': 'https',
            Authorization: authorization,
            ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            resolve({
              status: res.statusCode,
              headers: new Headers(res.headers),
              text: async () => text,
              json: async () => JSON.parse(text),
            });
          });
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  return { root, request };
}

test('private server rejects missing TLS and non-loopback HTTP configuration', () => {
  const env = {
    PKH_PRIVATE_ORIGIN: 'http://research.example.org',
    PKH_PRIVATE_USER: 'reader',
    PKH_PRIVATE_PASSWORD_HASH: passwordHash,
  };
  assert.throws(() => privateConfiguration(env), /HTTPS/);
  assert.throws(() => privateConfiguration({ ...env, PKH_PRIVATE_LOOPBACK_HTTP: '1' }), /HTTPS/);
  assert.equal(
    privateConfiguration({
      ...env,
      PKH_PRIVATE_ORIGIN: 'http://127.0.0.1:4177',
      PKH_PRIVATE_LOOPBACK_HTTP: '1',
    }).development,
    true,
  );
});

test('authenticated private retrieval includes reading records without public exposure', async (t) => {
  const { root, request } = await setup(t);
  await saveReadingRecords(root, {
    paperId: 'example',
    expectedRevision: 'empty',
    entries: [
      {
        id: 'question-one',
        text: 'privatequestiontoken',
        page: '',
        createdAt: '2026-09-24T00:00:00Z',
      },
    ],
  });
  const workspace = await (await request('/api/workspace')).json();
  assert.equal(workspace.readingRecords[0].entries[0].id, 'question-one');
  const found = await (await request('/api/retrieval?q=privatequestiontoken')).json();
  assert.equal(found.direct[0].readingRecordId, 'question-one');
  assert.equal(found.direct[0].paperId, 'example');
  const denied = await request('/api/retrieval?q=privatequestiontoken', {
    headers: { Authorization: '' },
  });
  assert.equal(denied.status, 401);
  assert.doesNotMatch(await denied.text(), /question-one|privatequestiontoken/);
});

test('authentication protects HTML, assets, workspace, PDF, search, records, tasks and drafts', async (t) => {
  const { request } = await setup(t);
  for (const url of [
    '/',
    '/assets/app.js',
    '/api/workspace',
    '/api/documents/' + documentId + '/file',
    '/api/retrieval?q=PRIVATE',
    '/api/reading-records?paperId=example',
    '/api/ai-tasks',
    '/api/drafts',
  ]) {
    const denied = await request(url, { headers: { Authorization: '' } });
    assert.equal(denied.status, 401, url);
    assert.match(denied.headers.get('www-authenticate'), /^Basic/);
    assert.match(denied.headers.get('cache-control'), /no-store/);
    assert.doesNotMatch(await denied.text(), /PRIVATE-NOTE|SYNTHETIC-PRIVATE-PDF/);
    const allowed = await request(url);
    assert.equal(allowed.status, 200, url);
    assert.match(allowed.headers.get('cache-control'), /no-store/);
    assert.equal(allowed.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await (await request('/api/drafts')).json()).drafts[0].marker, 'draft-inbox');
  assert.equal((await (await request('/api/ai-tasks')).json()).tasks[0].marker, 'ai-tasks');
  const html = await (await request('/')).text();
  assert.match(html, /__PKH_PRIVATE_WEB__=true/);
  const workspace = await (await request('/api/workspace')).json();
  assert.equal(workspace.dataset.papers[0].note, 'PRIVATE-NOTE-MARKER');
  assert.equal(workspace.readOnly, true);
  assert.equal(workspace.mode, 'private-web');
  assert.equal(workspace.csrfToken, undefined);
  assert.equal(workspace.documents[0].id, documentId);
  assert.match(
    await (await request('/api/documents/' + documentId + '/file')).text(),
    /SYNTHETIC-PRIVATE-PDF/,
  );
  assert.equal(
    (
      await request('/', {
        headers: {
          Authorization: 'Basic ' + Buffer.from('reader:incorrect-password').toString('base64'),
        },
      })
    ).status,
    401,
  );
});

test('read-only boundary rejects every mutation and leaves the authoritative file unchanged', async (t) => {
  const { request, root } = await setup(t);
  const before = await readFile(path.join(root, 'private/workspace.json'), 'utf8');
  for (const url of [
    '/api/records',
    '/api/reading-records',
    '/api/drafts/apply',
    '/api/ai-tasks',
    '/api/backup',
    '/api/restore',
    '/api/documents/import',
    '/api/ask',
    '/assets/app.js',
  ]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await request(url, { method, body: '{}' })).status, 405, `${method} ${url}`);
    }
  }
  assert.equal(await readFile(path.join(root, 'private/workspace.json'), 'utf8'), before);
  assert.equal((await request('/api/backups')).status, 404);
});

test('origin, TLS, private-path and symlink boundaries hold after authentication', async (t) => {
  const { request, root } = await setup(t);
  for (const headers of [
    { Host: 'attacker.example.org' },
    { Origin: 'https://attacker.example.org' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'X-Forwarded-Proto': 'http' },
  ]) {
    assert.equal((await request('/api/workspace', { headers })).status, 403);
  }
  assert.equal((await request('/private/workspace.json')).status, 404);
  await symlink(path.join(root, 'private/workspace.json'), path.join(root, 'dist/escape.json'));
  assert.equal((await request('/escape.json')).status, 403);
  assert.equal((await request('/api/documents/doc-' + 'b'.repeat(32) + '/file')).status, 404);
  const head = await request('/api/workspace', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('empty auxiliary reads do not create directories in the read-only snapshot', async (t) => {
  const { request, root } = await setup(t);
  await rm(path.join(root, 'private/draft-inbox'), { recursive: true });
  await rm(path.join(root, 'private/ai-tasks'), { recursive: true });
  assert.deepEqual((await (await request('/api/drafts')).json()).drafts, []);
  assert.deepEqual((await (await request('/api/ai-tasks')).json()).tasks, []);
  for (const folder of ['draft-inbox', 'ai-tasks']) {
    await assert.rejects(
      readFile(path.join(root, 'private', folder)),
      (error) => error.code === 'ENOENT',
    );
  }
});

test('a transferred complete backup restores into an isolated reader with PDF and auxiliary records', async (t) => {
  const source = await setup(t),
    destination = await setup(t);
  await mkdir(path.join(source.root, 'private/reading-records'), { recursive: true });
  await writeFile(
    path.join(source.root, 'private/reading-records/example.json'),
    JSON.stringify({
      paperId: 'example',
      revision: 'reading-one',
      entries: [{ id: 'one', page: '1', text: 'Recovered reading record' }],
    }),
  );
  const backup = await backupWorkspace(source.root);
  const target = path.join(destination.root, 'private/backups', backup.backupId);
  await cp(backup.path, target, { recursive: true });
  const before = await readWorkspace(destination.root);
  const restored = await restoreWorkspace(destination.root, {
    backupId: backup.backupId,
    expectedRevision: before.revision,
    write: true,
  });
  assert.notEqual(restored.revision, before.revision);
  const workspace = await (await destination.request('/api/workspace')).json();
  assert.equal(workspace.revision, restored.revision);
  assert.equal(workspace.dataset.papers[0].note, 'PRIVATE-NOTE-MARKER');
  assert.match(
    await (await destination.request('/api/documents/' + documentId + '/file')).text(),
    /SYNTHETIC-PRIVATE-PDF/,
  );
  assert.equal(
    (await (await destination.request('/api/drafts')).json()).drafts[0].marker,
    'draft-inbox',
  );
  assert.equal(
    (await (await destination.request('/api/ai-tasks')).json()).tasks[0].marker,
    'ai-tasks',
  );
  assert.equal(
    (await (await destination.request('/api/reading-records?paperId=example')).json()).entries[0]
      .text,
    'Recovered reading record',
  );
});
