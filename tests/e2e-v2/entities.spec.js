import { test, expect } from '@playwright/test';
import { readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { initializeWorkspace, putRecord } from '../../services/workspace-store.mjs';
async function state(request) {
  return (await request.get('/api/workspace')).json();
}
async function go(page, route = 'entities') {
  await page.goto('/#/' + route);
  await expect(page.getByText('本地完整研究库', { exact: true })).toBeVisible();
}
async function save(page, name = '保存实体') {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name, exact: true }).click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  await expect(page.getByRole('link', { name: '编辑档案', exact: true })).toBeVisible();
}
test.beforeEach(async () => {
  const { root } = JSON.parse(await readFile('tmp/v2-review/runtime.json', 'utf8'));
  if (!path.basename(root).startsWith('pkh-v2-browser-')) throw Error('Not test-owned');
  await rm(path.join(root, 'private'), { recursive: true, force: true });
  let store = await initializeWorkspace(root, { write: true });
  store = await putRecord(root, {
    collection: 'papers',
    record: {
      schemaVersion: 1,
      id: 'entity-test-paper',
      title: 'Synthetic entity paper',
      year: 2026,
      authors: ['Synthetic scholar'],
      url: 'https://example.org/paper',
      visibility: 'private',
    },
    expectedRevision: store.revision,
  });
  await mkdir('tmp/v2-review/screenshots', { recursive: true });
});
test('scholar and institution creation, sources, paper links, backlinks and rename form a complete persistent workflow', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await go(page, 'entities?create=1');
  await page.getByLabel('实体名称', { exact: true }).fill('Synthetic Robotics Institute');
  await page.getByLabel('实体类型', { exact: true }).selectOption('institution');
  await page.getByLabel('稳定 ID', { exact: true }).fill('entity-test-institute');
  await page
    .getByLabel('简介', { exact: true })
    .fill('Synthetic institution used only to test research-entity maintenance.');
  await save(page);
  await page.getByRole('link', { name: '研究对象', exact: true }).last().click();
  await page.getByRole('link', { name: '新建对象', exact: true }).click();
  await page.getByLabel('实体名称', { exact: true }).fill('Synthetic Scholar');
  await page.getByLabel('稳定 ID', { exact: true }).fill('entity-test-scholar');
  await page.getByLabel('别名（每行一个）').fill('合成学者\nSynthetic S.');
  await page
    .getByLabel('实体档案正文')
    .fill('## Identity and evidence\n\nPRIVATE synthetic dossier. No real affiliation claim.');
  await page.getByLabel('查找关联记录').fill('Synthetic');
  await page.getByRole('checkbox', { name: /Synthetic Robotics Institute\s*机构/ }).check();
  await page.getByRole('checkbox', { name: /Synthetic entity paper\s*论文/ }).check();
  await page.getByRole('button', { name: '添加资料来源' }).click();
  await page.getByLabel('来源名称', { exact: true }).fill('Synthetic official profile');
  await page.getByLabel('来源网址', { exact: true }).fill('https://example.org/profile');
  await page
    .getByLabel('支持范围 / 待核验事项')
    .fill('Synthetic source; no actual identity verification.');
  await save(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Synthetic Scholar', exact: true })).toBeVisible();
  await expect(
    page.getByText('PRIVATE synthetic dossier. No real affiliation claim.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '关联论文 · 1' })).toBeVisible();
  await page.getByRole('link', { name: 'Synthetic Robotics Institute', exact: true }).click();
  await expect(page.getByRole('heading', { name: '反向引用 · 1' })).toBeVisible();
  await page.getByRole('link', { name: '编辑档案', exact: true }).click();
  await page.getByLabel('实体名称', { exact: true }).fill('Renamed Synthetic Institute');
  await save(page);
  await page.getByRole('link', { name: 'Synthetic Scholar', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Renamed Synthetic Institute', exact: true }),
  ).toBeVisible();
  const s = await state(request);
  expect(s.dataset.concepts.find((e) => e.id === 'entity-test-scholar').relatedIds).toEqual([
    'entity-test-institute',
    'entity-test-paper',
  ]);
  expect(s.dataset.concepts.find((e) => e.id === 'entity-test-scholar').visibility).toBe('private');
  await expect(page.locator('.toast')).toBeHidden();
  await page.screenshot({ path: 'tmp/v2-review/screenshots/entities-detail.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('archive, filter by type, restore and mobile catalog use the same stable entity', async ({
  page,
  request,
}) => {
  await go(page, 'entities?create=1');
  await page.getByLabel('实体名称', { exact: true }).fill('Synthetic Research Project');
  await page.getByLabel('实体类型', { exact: true }).selectOption('project');
  await page.getByLabel('稳定 ID', { exact: true }).fill('entity-test-project');
  await save(page);
  await page.getByRole('link', { name: '编辑档案', exact: true }).click();
  await save(page, '归档实体');
  await go(page, 'entities?kind=project');
  await expect(page.getByRole('heading', { name: '这里还没有符合条件的实体' })).toBeVisible();
  await page.getByLabel('包含归档').check();
  await page.getByRole('link', { name: 'Synthetic Research Project', exact: true }).click();
  await page.getByRole('link', { name: '编辑档案', exact: true }).click();
  await save(page, '恢复实体');
  expect(
    (await state(request)).dataset.concepts.find((e) => e.id === 'entity-test-project').lifecycle,
  ).toBe('active');
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page);
  await page.getByLabel('搜索研究对象').fill('Synthetic');
  await expect(
    page.getByRole('link', { name: 'Synthetic Research Project', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.toast')).toBeHidden();
  await page.screenshot({ path: 'tmp/v2-review/screenshots/entities-mobile.png', fullPage: true });
});
test('entity editor conflict preserves draft without overwriting the current record', async ({
  page,
  request,
}) => {
  await go(page, 'entities?create=1');
  await page.getByLabel('实体名称', { exact: true }).fill('Synthetic Model');
  await page.getByLabel('稳定 ID', { exact: true }).fill('entity-test-model');
  await page.getByLabel('实体类型', { exact: true }).selectOption('model');
  await save(page);
  await page.getByRole('link', { name: '编辑档案', exact: true }).click();
  await page.getByLabel('实体档案正文').fill('UNSAVED MODEL DOSSIER');
  const s = await state(request),
    record = s.dataset.concepts.find((e) => e.id === 'entity-test-model');
  const response = await request.post('/api/records', {
    headers: { 'X-Workspace-Token': s.csrfToken },
    data: {
      collection: 'concepts',
      record: { ...record, description: 'Concurrent change' },
      expectedRevision: s.revision,
    },
  });
  expect(response.ok()).toBeTruthy();
  const conflict = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存实体', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByLabel('实体档案正文')).toHaveValue('UNSAVED MODEL DOSSIER');
  expect((await state(request)).dataset.concepts.find((e) => e.id === record.id).description).toBe(
    'Concurrent change',
  );
});

test('new entity never overwrites an existing ID and the ID new remains a usable record', async ({
  page,
  request,
}) => {
  await go(page, 'entities?create=1');
  await page.getByLabel('实体名称', { exact: true }).fill('Original stable record');
  await page.getByLabel('稳定 ID', { exact: true }).fill('new');
  await page.getByLabel('实体档案正文').fill('KEEP ORIGINAL');
  await save(page);
  await expect(
    page.getByRole('heading', { name: 'Original stable record', exact: true }),
  ).toBeVisible();
  await go(page, 'entities?create=1');
  await page.getByLabel('实体名称', { exact: true }).fill('Accidental replacement');
  await page.getByLabel('稳定 ID', { exact: true }).fill('new');
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/api/records') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存实体', exact: true }).click();
  expect((await result).status()).toBe(409);
  await expect(page.getByLabel('实体名称', { exact: true })).toHaveValue('Accidental replacement');
  expect((await state(request)).dataset.concepts.find((e) => e.id === 'new').note).toBe(
    'KEEP ORIGINAL',
  );
});

test('research object groups keep methods separate from data and question records', async ({
  page,
}) => {
  await go(page, 'entities?create=1');
  await page.getByLabel('实体名称', { exact: true }).fill('Synthetic Method');
  await page.getByLabel('实体类型', { exact: true }).selectOption('method');
  await page.getByLabel('稳定 ID', { exact: true }).fill('entity-test-method');
  await save(page);
  await go(page, 'entities?group=methods');
  await expect(page.getByRole('tab', { name: /方法与模型/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('link', { name: 'Synthetic Method', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /数据与评测/ }).click();
  await expect(page.getByRole('link', { name: 'Synthetic Method', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open X-Embodiment', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/group=data/);
});
