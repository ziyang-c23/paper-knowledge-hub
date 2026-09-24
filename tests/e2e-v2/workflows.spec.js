import { test, expect } from '@playwright/test';
import { readFile, rm, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import {
  initializeWorkspace,
  readWorkspace,
  commitWorkspace,
} from '../../services/workspace-store.mjs';
const shots = 'tmp/v2-review/screenshots';
const fixture = {
  schemaVersion: 1,
  id: 'test-only-workbench',
  title: 'TEST ONLY Persistence Research',
  authors: ['Synthetic Author'],
  year: 2026,
  url: 'https://example.org/test-only',
  visibility: 'private',
  lifecycle: 'draft',
  note: '## Test fixture\n\nUniqueWorkbenchNeedle is synthetic test text.',
};
async function workspace(request) {
  const response = await request.get('/api/workspace');
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function requireSeed(request, ids) {
  const data = (await workspace(request)).dataset;
  test.skip(
    ids.some((id) => !data.papers.some((p) => p.id === id)),
    'Selected-public source package does not contain required seed papers.',
  );
}
async function go(page, route) {
  await page.goto('/#/' + route);
  await expect(page.getByText('本地完整研究库', { exact: true })).toBeVisible();
}
async function save(page, name = '保存草稿 / 修改') {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name, exact: true }).click();
  const saved = await response;
  expect(saved.status(), await saved.text()).toBe(200);
  await expect(page.getByText('无未保存修改', { exact: true })).toBeVisible();
}
test.beforeEach(async () => {
  const { root } = JSON.parse(await readFile('tmp/v2-review/runtime.json', 'utf8'));
  if (!path.basename(root).startsWith('pkh-v2-browser-')) throw Error('Not a test-owned directory');
  await rm(path.join(root, 'private'), { recursive: true, force: true });
  await initializeWorkspace(root, { write: true });
  await mkdir(shots, { recursive: true });
});
test('local draft persists to authoritative JSON, activates, searches, archives and restores', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await go(page, 'edit/new');
  await page.getByLabel('论文名称', { exact: true }).fill(fixture.title);
  await page.getByLabel('稳定 ID', { exact: true }).fill(fixture.id);
  await page.getByLabel('作者', { exact: true }).fill('Synthetic Author');
  await page.getByLabel('原文链接', { exact: true }).fill(fixture.url);
  await page.getByLabel('笔记正文', { exact: true }).fill(fixture.note);
  await page
    .getByLabel('个人分析', { exact: true })
    .fill('PRIVATE synthetic hypothesis, not a paper claim.');
  await save(page);
  await page.reload();
  await expect(page.getByLabel('笔记正文', { exact: true })).toHaveValue(fixture.note);
  let state = await workspace(request);
  let record = state.dataset.papers.find((p) => p.id === fixture.id);
  expect(record.visibility).toBe('private');
  expect(record.lifecycle).toBe('draft');
  const { root } = JSON.parse(await readFile('tmp/v2-review/runtime.json', 'utf8'));
  const disk = JSON.parse(await readFile(path.join(root, 'private/workspace.json'), 'utf8'));
  expect(disk.dataset.papers.find((p) => p.id === fixture.id).note).toBe(fixture.note);
  await save(page, '审阅后正式入库');
  await go(page, 'research?q=UniqueWorkbenchNeedle');
  await expect(page.locator('.search-result')).toContainText('UniqueWorkbenchNeedle');
  await page.screenshot({ path: shots + '/private-retrieval.png', fullPage: true });
  await go(page, 'edit/' + fixture.id);
  await save(page, '归档');
  await go(page, 'research?q=UniqueWorkbenchNeedle');
  await expect(page.getByRole('heading', { name: '当前范围内证据不足' })).toBeVisible();
  await go(page, 'manage');
  await page.getByRole('tab', { name: '入库与归档' }).click();
  await expect(page.getByRole('heading', { name: '归档记录 · 1' })).toBeVisible();
  await page.getByRole('link', { name: '查看并恢复' }).click();
  await save(page, '恢复入库');
  state = await workspace(request);
  expect(state.dataset.papers.find((p) => p.id === fixture.id).lifecycle).toBe('active');
  expect(errors).toEqual([]);
});
test('JSON and Markdown entry merge without guessing metadata; duplicate identity refused', async ({
  page,
  request,
}) => {
  await go(page, 'edit/new');
  await page
    .getByText('导入已有 JSON / Markdown（仅填入编辑器，不自动覆盖）', { exact: true })
    .click();
  await page.getByLabel('导入 JSON 内容').fill(JSON.stringify(fixture));
  await page.getByRole('button', { name: '检查身份并填入' }).click();
  await expect(page.getByLabel('论文名称', { exact: true })).toHaveValue(fixture.title);
  await page.getByLabel('Markdown 正文文件').setInputFiles({
    name: 'synthetic.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Uploaded fixture\n\nMarkdownNeedle'),
  });
  await save(page);
  await page.reload();
  await expect(page.getByLabel('笔记正文', { exact: true })).toHaveValue(
    '# Uploaded fixture\n\nMarkdownNeedle',
  );
  await go(page, 'edit/new');
  await page
    .getByText('导入已有 JSON / Markdown（仅填入编辑器，不自动覆盖）', { exact: true })
    .click();
  await page
    .getByLabel('导入 JSON 内容')
    .fill(JSON.stringify({ ...fixture, id: 'duplicate-fixture' }));
  await page.getByRole('button', { name: '检查身份并填入' }).click();
  await expect(page.getByRole('alert')).toContainText('已有相同身份论文');
  expect(
    (await workspace(request)).dataset.papers.filter((p) => p.title === fixture.title),
  ).toHaveLength(1);
});
test('two tabs detect stale version and retain unsaved note without overwriting', async ({
  page,
  context,
  request,
}) => {
  await requireSeed(request, ['openvla']);
  await go(page, 'edit/openvla');
  const second = await context.newPage();
  await go(second, 'edit/openvla');
  await page.getByLabel('个人分析', { exact: true }).fill('First tab persisted synthetic note');
  await save(page);
  await second.getByLabel('个人分析', { exact: true }).fill('Second tab unsaved synthetic note');
  await second.getByRole('button', { name: '保存草稿 / 修改', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('冲突');
  await expect(second.getByLabel('个人分析', { exact: true })).toHaveValue(
    'Second tab unsaved synthetic note',
  );
  expect(
    (await workspace(request)).dataset.papers.find((p) => p.id === 'openvla').personalAnalysis,
  ).toBe('First tab persisted synthetic note');
  const download = second.waitForEvent('download');
  await second.getByRole('button', { name: '导出当前修改' }).click();
  expect(
    JSON.parse(await readFile(await (await download).path(), 'utf8')).personalAnalysis,
  ).toContain('Second tab');
  await second.screenshot({ path: shots + '/conflict-preserved.png', fullPage: true });
  second.once('dialog', (d) => d.accept());
  await second.getByRole('button', { name: '重新读取编辑内容', exact: true }).click();
  await expect(second.getByLabel('个人分析', { exact: true })).toHaveValue(
    'First tab persisted synthetic note',
  );
  await second.getByLabel('个人分析', { exact: true }).fill('Merged after explicit reload');
  await save(second);
  expect(
    (await workspace(request)).dataset.papers.find((p) => p.id === 'openvla').personalAnalysis,
  ).toBe('Merged after explicit reload');
});
test('classification and relation review persist through reload', async ({ page, request }) => {
  await requireSeed(request, ['octo', 'openvla']);
  await go(page, 'edit/octo');
  const before = (await workspace(request)).dataset.papers.find((p) => p.id === 'octo');
  const topic = (await workspace(request)).dataset.topics.find(
    (t) => !(before.topics || []).includes(t.id),
  );
  await page.getByLabel(topic.title, { exact: true }).check();
  await save(page);
  await page.reload();
  await expect(page.getByLabel(topic.title, { exact: true })).toBeChecked();
  await go(page, 'manage');
  await page.getByRole('tab', { name: '专题 / 实体 / 证据' }).click();
  await page.getByLabel('对象类型').selectOption('relations');
  await page.getByLabel('对象 ID').fill('test-only-citation');
  await page.getByLabel('来源实体').selectOption('octo');
  await page.getByLabel('目标实体').selectOption('openvla');
  await page.getByLabel('关系含义').selectOption('cites');
  await page.getByRole('button', { name: '保存关联记录' }).click();
  await expect(page.getByRole('status')).toContainText('关联记录已落盘');
  const record = (await workspace(request)).dataset.relations.find(
    (r) => r.id === 'test-only-citation',
  );
  expect(record.type).toBe('cites');
  expect(record.status).toBe('pending');
  expect(record.visibility).toBe('private');
});
test('comparison keeps source provenance; model disabled leaves local search available', async ({
  page,
  request,
}) => {
  await requireSeed(request, ['openvla', 'rt-2']);
  await go(page, 'compare?ids=openvla,rt-2');
  await expect(page.locator('.comparison-table')).toContainText('OpenVLA');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  const body = await readFile(await (await event).path(), 'utf8');
  expect(body).toContain('来源');
  expect(body).toContain('arxiv.org');
  await go(page, 'query?q=OpenVLA');
  await expect(page.getByText('未配置', { exact: true })).toBeVisible();
  await go(page, 'research?q=OpenVLA');
  await expect(page.locator('.search-result').first()).toBeVisible();
  await page.screenshot({ path: shots + '/local-research.png', fullPage: true });
});
test('narrow screen editor, maintenance and research routes remain usable without overflow', async ({
  page,
  request,
}) => {
  await requireSeed(request, ['openvla', 'rt-2', 'octo']);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    'edit/openvla',
    'manage',
    'research?q=OpenVLA',
    'compare?ids=openvla,rt-2',
    'paper/octo',
  ]) {
    await go(page, route);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      route,
    ).toBeTruthy();
  }
  await page.screenshot({ path: shots + '/mobile-local.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('backup picker restores an earlier authoritative note revision', async ({ page, request }) => {
  await requireSeed(request, ['openvla']);
  await go(page, 'edit/openvla');
  await page.getByLabel('个人分析', { exact: true }).fill('Backup revision synthetic value');
  await save(page);
  await go(page, 'manage');
  await page.getByRole('tab', { name: '备份与公开边界' }).click();
  await page.getByRole('button', { name: '创建本地完整备份' }).click();
  await expect(page.getByRole('status')).toContainText('完整本地备份已保存');
  const backup = await request.get('/api/backups');
  const backupId = (await backup.json()).backups[0].backupId;
  await expect(page.getByLabel('恢复点', { exact: true }).locator('option')).toHaveCount(2);
  await page.getByLabel('恢复点', { exact: true }).selectOption(backupId);
  await go(page, 'edit/openvla');
  await page.getByLabel('个人分析', { exact: true }).fill('Later synthetic value');
  await save(page);
  await go(page, 'manage');
  await page.getByRole('tab', { name: '备份与公开边界' }).click();
  await page.getByRole('button', { name: '读取可恢复备份' }).click();
  await page.getByLabel('恢复点', { exact: true }).selectOption(backupId);
  await page
    .getByRole('checkbox', { name: '我已核对恢复点；恢复会替换当前本地库，并先备份当前状态。' })
    .check();
  await page.getByRole('button', { name: '恢复所选备份' }).click();
  await expect(page.getByRole('status')).toContainText('已恢复主数据');
  expect(
    (await workspace(request)).dataset.papers.find((p) => p.id === 'openvla').personalAnalysis,
  ).toBe('Backup revision synthetic value');
});

test('maintenance exposes automatic version history after an ordinary save', async ({
  page,
  request,
}) => {
  await page.goto('/#/manage');
  await expect(page.getByRole('heading', { name: '设置与维护', exact: true })).toBeVisible();
  await page.goto('/#/edit/new');
  await page.getByLabel('论文名称', { exact: true }).fill('History fixture paper');
  await page.getByLabel('稳定 ID', { exact: true }).fill('history-fixture');
  await page.getByLabel('原文链接', { exact: true }).fill('https://example.org/history-fixture');
  await save(page);
  await page.goto('/#/manage');
  await page.getByRole('tab', { name: '备份与公开边界' }).click();
  await page.getByRole('button', { name: '读取版本历史' }).click();
  await expect(page.getByRole('heading', { name: /自动版本历史/ })).toContainText('1');
  const history = await (await request.get('/api/history')).json();
  expect(history.history.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button', { name: /下载历史/ }).first()).toBeVisible();
});
test('malformed JSON stays editable and partial existing import preserves omitted fields', async ({
  page,
  request,
}) => {
  await requireSeed(request, ['openvla']);
  const original = (await workspace(request)).dataset.papers.find((p) => p.id === 'openvla');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await go(page, 'edit/openvla');
  await page
    .getByText('导入已有 JSON / Markdown（仅填入编辑器，不自动覆盖）', { exact: true })
    .click();
  await page
    .getByLabel('导入 JSON 内容')
    .fill(JSON.stringify({ ...original, authors: 'not-an-array' }));
  await page.getByRole('button', { name: '检查身份并填入' }).click();
  await expect(page.getByRole('alert')).toContainText('authors 必须是字符串数组');
  await expect(page.getByLabel('论文名称', { exact: true })).toHaveValue(original.title);
  await page.getByLabel('导入 JSON 内容').fill(
    JSON.stringify({
      schemaVersion: 1,
      id: original.id,
      title: original.title,
      note: '# Partial merge synthetic note',
    }),
  );
  await page.getByRole('button', { name: '检查身份并填入' }).click();
  await save(page);
  const merged = (await workspace(request)).dataset.papers.find((p) => p.id === 'openvla');
  expect(merged.authors).toEqual(original.authors);
  expect(merged.url).toBe(original.url);
  expect(merged.topics).toEqual(original.topics);
  expect(merged.note).toBe('# Partial merge synthetic note');
  expect(errors).toEqual([]);
});
test('optional actual PDF canvas renders and file-page navigation changes extracted text', async ({
  page,
  request,
}) => {
  let names = [];
  try {
    names = await readdir('private/documents');
  } catch {}
  const papers = (await workspace(request)).dataset.papers;
  let document;
  for (const name of names.filter((n) => /^doc-[a-f0-9]+\.json$/.test(n))) {
    const candidate = JSON.parse(await readFile(path.join('private/documents', name), 'utf8'));
    if (candidate.pageCount > 1 && papers.some((p) => p.id === candidate.paperId)) {
      document = candidate;
      break;
    }
  }
  test.skip(
    !document,
    'Optional local public-paper PDF absent; source ZIP intentionally excludes private documents.',
  );
  const { root } = JSON.parse(await readFile('tmp/v2-review/runtime.json', 'utf8'));
  await mkdir(path.join(root, 'private/documents'), { recursive: true });
  for (const suffix of ['.json', '.pdf'])
    await copyFile(
      path.join('private/documents', document.id + suffix),
      path.join(root, 'private/documents', document.id + suffix),
    );
  const store = await readWorkspace(root);
  await commitWorkspace(root, { ...store, documentIds: [document.id] });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await go(page, 'document/' + document.id + '?page=1');
  const canvas = page.locator('canvas[role=img]');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((c) => ({ width: c.width, height: c.height })))
    .toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
  await expect
    .poll(() =>
      canvas.evaluate((c) => {
        if (c.width < 20 || c.height < 20) return false;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let min = 255,
          max = 0;
        for (let i = 0; i < d.length; i += 40) {
          min = Math.min(min, d[i]);
          max = Math.max(max, d[i]);
        }
        return max - min > 40;
      }),
    )
    .toBeTruthy();
  const first = await page.locator('.pdf-text').innerText();
  await page.getByLabel('PDF 文件页序', { exact: true }).selectOption('2');
  await expect(page.getByRole('heading', { name: '提取文本 · 文件第 2 页' })).toBeVisible();
  await expect.poll(() => page.locator('.pdf-text').innerText()).not.toBe(first);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.pdf-canvas-panel [role="status"]')).toHaveCount(0);
  await expect(page.locator('.pdf-canvas-panel [role="alert"]')).toHaveCount(0);
  await page.screenshot({ path: shots + '/actual-pdf-canvas.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('two-dimensional facet filters intersect and survive reload', async ({ page, request }) => {
  const put = async (collection, record) => {
    const state = await workspace(request);
    const response = await request.post('/api/records', {
      headers: { 'X-Workspace-Token': state.csrfToken },
      data: { collection, record, expectedRevision: state.revision },
    });
    expect(response.status(), await response.text()).toBe(200);
  };
  for (const [id, dimension] of [
    ['test-problem', 'problem'],
    ['test-architecture', 'architecture'],
  ])
    await put('concepts', {
      schemaVersion: 1,
      id,
      visibility: 'private',
      kind: 'concept',
      title: 'TEST ONLY ' + id,
      description: 'Synthetic filter fixture',
      dimension,
    });
  for (const [id, facets] of [
    ['test-both', { problem: ['test-problem'], architecture: ['test-architecture'] }],
    ['test-problem-only', { problem: ['test-problem'] }],
    ['test-architecture-only', { architecture: ['test-architecture'] }],
  ])
    await put('papers', { ...fixture, id, title: 'TEST ONLY ' + id, lifecycle: 'active', facets });
  await go(page, 'library');
  await page.getByLabel('研究问题筛选', { exact: true }).selectOption('test-problem');
  await expect(page.locator('.paper-row')).toHaveCount(2);
  await page.getByLabel('模型架构筛选', { exact: true }).selectOption('test-architecture');
  await expect(page.locator('.paper-row')).toHaveCount(1);
  await expect(page.locator('.paper-row')).toContainText('TEST ONLY test-both');
  await page.reload();
  await expect(page.getByLabel('研究问题筛选', { exact: true })).toHaveValue('test-problem');
  await expect(page.getByLabel('模型架构筛选', { exact: true })).toHaveValue('test-architecture');
  await expect(page.locator('.paper-row')).toHaveCount(1);
});
test('optional provenance maintenance links PDF pages and comparison field evidence through UI', async ({
  page,
  request,
}) => {
  await requireSeed(request, ['octo', 'openvla']);
  let names = [];
  try {
    names = await readdir('private/documents');
  } catch {}
  let document;
  for (const name of names.filter((n) => /^doc-[a-f0-9]+\.json$/.test(n))) {
    const candidate = JSON.parse(await readFile(path.join('private/documents', name), 'utf8'));
    if (candidate.paperId === 'octo' && candidate.pageCount >= 4) {
      document = candidate;
      break;
    }
  }
  test.skip(
    !document,
    'Optional actual Octo PDF absent; PDF originals are excluded from source ZIP.',
  );
  const { root } = JSON.parse(await readFile('tmp/v2-review/runtime.json', 'utf8'));
  await mkdir(path.join(root, 'private/documents'), { recursive: true });
  for (const suffix of ['.json', '.pdf'])
    await copyFile(
      path.join('private/documents', document.id + suffix),
      path.join(root, 'private/documents', document.id + suffix),
    );
  const store = await readWorkspace(root);
  await commitWorkspace(root, { ...store, documentIds: [document.id] });
  await go(page, 'manage');
  await page.getByRole('tab', { name: '专题 / 实体 / 证据' }).click();
  await page.getByLabel('对象类型', { exact: true }).selectOption('evidence');
  await page.getByLabel('编辑对象', { exact: true }).selectOption('ev-octo-method');
  await page.getByLabel('证据原文文档', { exact: true }).selectOption(document.id);
  await page.getByLabel('证据文件页序', { exact: true }).fill('4');
  const pending = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存关联记录' }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  const evidence = (await workspace(request)).dataset.evidence.find(
    (e) => e.id === 'ev-octo-method',
  );
  expect(evidence.documentId).toBe(document.id);
  expect(evidence.pageIndex).toBe(4);
  await go(page, 'paper/octo?evidence=ev-octo-method');
  await page
    .locator('#evidence-ev-octo-method')
    .getByRole('link', { name: /PDF|文件第|原文文件/ })
    .click();
  await expect(page).toHaveURL(new RegExp('/document/' + document.id + '\\?page=4'));
  await expect(page.getByLabel('PDF 文件页序', { exact: true })).toHaveValue('4');
  await go(page, 'edit/octo');
  await page.getByText('渐进补全：研究问题、方法、评测与局限', { exact: true }).click();
  await page.getByLabel('依据 核心方法', { exact: true }).selectOption(['ev-octo-method']);
  await save(page);
  expect(
    (await workspace(request)).dataset.papers.find((p) => p.id === 'octo').claimEvidence.method,
  ).toEqual(['ev-octo-method']);
  await go(page, 'paper/octo');
  await expect(
    page.getByRole('link', { name: '依据 ev-octo-method', exact: true }).first(),
  ).toBeVisible();
  await go(page, 'compare?ids=octo,openvla');
  await expect(
    page.getByRole('link', { name: '依据 ev-octo-method', exact: true }).first(),
  ).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  const text = await readFile(await (await dl).path(), 'utf8');
  expect(text).toContain('ev-octo-method');
  expect(text).toContain(document.id);
  expect(text).toContain('文件页序 4');
});
