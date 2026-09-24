/** Run after npm run build. Isolated real-browser private-reader acceptance. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { initializeWorkspace, commitWorkspace } from '../../services/workspace-store.mjs';
import { processPDF } from '../../services/pdf.mjs';
import { createPrivateServer, hashPrivatePassword } from '../../services/private-server.mjs';

function samplePDF() {
  const stream = 'BT /F1 16 Tf 40 700 Td (Private browser PDF fixture) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
const repo = process.cwd(),
  root = await mkdtemp(path.join(tmpdir(), 'pkh-private-browser-'));
const screenshots = path.join(repo, 'tmp/private-web-review');
let server, browser;
try {
  await mkdir(path.join(root, 'content/papers'), { recursive: true });
  await writeFile(
    path.join(root, 'content/papers/fixture.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'fixture',
      title: 'Private browser research fixture',
      year: 2026,
      authors: ['Synthetic Author'],
      url: 'https://example.org',
      visibility: 'public',
      note: '## 论文概览\n\nPRIVATE_BROWSER_NOTE searchable mechanism.\n\n## 方法\n\nA synthetic reading fixture, not research evidence.',
    }),
  );
  const initial = await initializeWorkspace(root, { write: true });
  const document = await processPDF({
    root,
    paperId: 'fixture',
    bytes: samplePDF(),
    filename: 'fixture.pdf',
  });
  await commitWorkspace(root, { ...initial, documentIds: [document.id] });
  for (const dir of ['draft-inbox', 'reading-records'])
    await mkdir(path.join(root, 'private', dir), { recursive: true });
  await writeFile(
    path.join(root, 'private/draft-inbox/11111111-1111-1111-1111-111111111111.json'),
    JSON.stringify({
      id: '11111111-1111-1111-1111-111111111111',
      status: 'pending',
      record: { id: 'fixture', title: 'Browser draft fixture', note: 'DRAFT_BROWSER_MARKER' },
      updatedAt: '2026-09-24',
    }),
  );
  await writeFile(
    path.join(root, 'private/reading-records/fixture.json'),
    JSON.stringify({
      paperId: 'fixture',
      revision: 'fixture',
      entries: [{ id: 'one', text: 'READING_BROWSER_MARKER', page: '1' }],
    }),
  );
  const before = await readFile(path.join(root, 'private/workspace.json'), 'utf8');
  const port = 43000 + Math.floor(Math.random() * 10000),
    origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(32).toString('hex');
  server = createPrivateServer({
    root,
    dist: path.join(repo, 'dist'),
    config: {
      origin,
      username: 'fixture',
      passwordHash: await hashPrivatePassword(password),
      development: true,
    },
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  for (const route of ['/', '/api/workspace', '/api/drafts', `/api/documents/${document.id}/file`])
    assert.equal((await fetch(origin + route)).status, 401);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    httpCredentials: { username: 'fixture', password },
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [],
    writes = [],
    failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.method() + ' ' + r.url());
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400)
      failed.push(r.status() + ' ' + new URL(r.url()).pathname);
  });
  await mkdir(screenshots, { recursive: true });
  await page.goto(origin + '/#/paper/fixture?mode=note');
  await page.getByText('PRIVATE_BROWSER_NOTE searchable mechanism.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '编辑论文', exact: true }).count(), 0);
  await page.screenshot({ path: path.join(screenshots, 'note-desktop.png') });
  await page.goto(origin + `/#/document/${document.id}?page=1`);
  await page.locator('canvas[role="img"]').waitFor();
  await page.screenshot({ path: path.join(screenshots, 'pdf-desktop.png') });
  await page.goto(origin + '/#/paper/fixture?mode=source');
  await page.getByText('READING_BROWSER_MARKER', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '保存阅读记录', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '删除', exact: true }).count(), 0);

  await page.goto(origin + '/#/drafts');
  await page.getByText('Browser draft fixture · pending', { exact: true }).click();
  await page.getByText('DRAFT_BROWSER_MARKER', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /应用|采纳/ }).count(), 0);
  await page.screenshot({ path: path.join(screenshots, 'drafts-desktop.png') });
  await page.goto(origin + '/#/library');
  await page.getByText('Private browser research fixture', { exact: true }).first().waitFor();
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/retrieval?q=PRIVATE_BROWSER_NOTE');
    return { status: r.status, body: await r.text() };
  });
  assert.equal(result.status, 200);
  assert.match(result.body, /fixture/);
  await page.goto(origin + '/#/edit/fixture');
  await page.getByRole('heading', { name: '私人网页 · 只读' }).waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(origin + '/#/paper/fixture?mode=note');
    await page.getByText('PRIVATE_BROWSER_NOTE searchable mechanism.', { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${width}px overflow`,
    );
    await page.screenshot({ path: path.join(screenshots, `note-${width}.png`) });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(writes, []);
  assert.equal(await readFile(path.join(root, 'private/workspace.json'), 'utf8'), before);
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        'unauthenticated denial',
        'authenticated full note',
        'PDF rendering',
        'draft reading',
        'private search',
        'edit route blocked',
        '320/390 no overflow',
        'no page errors',
        'no writes',
        'workspace unchanged',
      ],
      screenshots,
    }),
  );
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(root, { recursive: true, force: true });
}
