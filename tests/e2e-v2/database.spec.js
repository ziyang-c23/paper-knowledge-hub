import { test, expect } from '@playwright/test';
import { readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { initializeWorkspace, putRecord } from '../../services/workspace-store.mjs';
import { saveDatabase, patchPapers } from '../../services/database-store.mjs';
import { defaultDatabase } from '../../src/lib/database.mjs';
const shots = 'tmp/v2-review/screenshots';
async function state(request) {
  return (await request.get('/api/workspace')).json();
}
async function post(request, url, body) {
  const s = await state(request);
  const response = await request.post(url, {
    headers: { 'X-Workspace-Token': s.csrfToken },
    data: { ...body, expectedRevision: s.revision },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function go(page, view = 'view-all') {
  await page.goto('/#/database?view=' + view);
  await expect(page.getByRole('heading', { name: '论文数据库', exact: true })).toBeVisible();
}
async function saved(page, button, url) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith(url) && r.request().method() === 'POST',
  );
  await button.click();
  const res = await response;
  expect(res.status(), await res.text()).toBe(200);
  await expect(page.locator('.database-page')).toHaveAttribute('aria-busy', 'false');
}
test.beforeEach(async () => {
  const { root } = JSON.parse(await readFile('tmp/v2-review/runtime.json', 'utf8'));
  if (!path.basename(root).startsWith('pkh-v2-browser-')) throw Error('Not a test-owned directory');
  await rm(path.join(root, 'private'), { recursive: true, force: true });
  let store = await initializeWorkspace(root, { write: true });
  for (const [id, title, year, status] of [
    ['db-alpha', 'DB Alpha', 2024, 'unread'],
    ['db-beta', 'DB Beta', 2025, 'reading'],
    ['db-gamma', 'DB Gamma', 2026, 'reviewed'],
  ])
    store = await putRecord(root, {
      collection: 'papers',
      record: {
        schemaVersion: 1,
        id,
        title: 'Database fixture ' + title,
        acronym: title,
        year,
        status,
        authors: ['Synthetic author'],
        url: 'https://example.org/' + id,
        visibility: 'private',
        lifecycle: 'active',
        note: '## Synthetic reading note\n\nThis record only tests database workflows.',
      },
      expectedRevision: store.revision,
    });
  const database = defaultDatabase();
  database.properties = [
    { id: 'due', name: '阅读日期', type: 'date' },
    { id: 'ready', name: '已复现', type: 'checkbox' },
    { id: 'memo', name: '自定义文本', type: 'text' },
  ];
  store = await saveDatabase(root, { database, expectedRevision: store.revision });
  await patchPapers(root, {
    expectedRevision: store.revision,
    changes: [
      {
        id: 'db-alpha',
        changes: { customProperties: { due: '2026-09-24', ready: false, memo: '__proto__' } },
      },
      { id: 'db-beta', changes: { customProperties: { ready: true, memo: 'public' } } },
    ],
  });
  await mkdir(shots, { recursive: true });
});
test('custom property creation, inline value, column order and saved view survive reload', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await go(page);
  await page.getByLabel('搜索数据库').fill('Database fixture');
  await page.getByRole('button', { name: '管理自定义属性' }).click();
  const dialog = page.getByRole('dialog', { name: '数据库属性' });
  await dialog.getByLabel('属性名称').fill('优先级分数');
  await dialog.getByLabel('属性类型').selectOption('number');
  await saved(page, dialog.getByRole('button', { name: '创建属性' }), '/api/database');
  await dialog.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await page.getByLabel('优先级分数', { exact: true }).check();
  await page.getByLabel('自定义文本', { exact: true }).check();
  await page.getByRole('button', { name: '上移 优先级分数' }).click();
  await saved(page, page.getByRole('button', { name: '保存视图 *', exact: true }), '/api/database');
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 自定义文本：__proto__', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'DB Beta · 自定义文本：public', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'DB Alpha · 优先级分数：—', exact: true }).click();
  await page.getByLabel('编辑 优先级分数').fill('0');
  await saved(page, page.getByRole('button', { name: '保存单元格' }), '/api/papers/batch');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 优先级分数：0', exact: true }),
  ).toBeVisible();
  expect((await state(request)).database.views[0].query).toBe('Database fixture');
  await page.screenshot({ path: shots + '/database-table.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('formula property computes from paper fields, is read-only and survives view reload', async ({
  page,
  request,
}) => {
  await go(page);
  await page.getByRole('button', { name: '管理自定义属性' }).click();
  const dialog = page.getByRole('dialog', { name: '数据库属性' });
  await dialog.getByLabel('属性名称').fill('阅读年限');
  await dialog.getByLabel('属性类型').selectOption('formula');
  await dialog.getByLabel('公式返回类型').selectOption('number');
  await dialog.getByLabel('公式表达式').fill('prop("year") - 2020');
  await saved(page, dialog.getByRole('button', { name: '创建属性' }), '/api/database');
  await dialog.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await page.getByLabel('阅读年限', { exact: true }).check();
  await saved(page, page.getByRole('button', { name: '保存视图 *', exact: true }), '/api/database');
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 阅读年限：4', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 阅读年限：4', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 阅读年限：4', exact: true }),
  ).toBeVisible();
  const state = await (await request.get('/api/workspace')).json();
  expect(state.database.properties.find((property) => property.name === '阅读年限')).toMatchObject({
    type: 'formula',
    expression: 'prop("year") - 2020',
  });
  const property = state.database.properties.find((item) => item.name === '阅读年限');
  expect(
    Object.hasOwn(
      state.dataset.papers.find((paper) => paper.id === 'db-alpha').customProperties,
      property.id,
    ),
  ).toBeFalsy();
});

test('rollup property follows explicit paper relations and updates after the source batch changes', async ({
  page,
  request,
}) => {
  await go(page);
  const current = await state(request);
  const database = structuredClone(current.database);
  database.properties.push(
    { id: 'related', name: '相关论文', type: 'relation' },
    { id: 'score', name: '实验分数', type: 'number' },
    {
      id: 'related-total',
      name: '关联分数',
      type: 'rollup',
      relation: 'related',
      source: 'custom:score',
      aggregate: 'sum',
    },
  );
  database.views[0].columns.push('custom:related-total');
  await post(request, '/api/database', { database });
  await post(request, '/api/papers/batch', {
    changes: [
      {
        id: 'db-alpha',
        changes: { customProperties: { related: ['db-beta', 'db-gamma'] } },
      },
      { id: 'db-beta', changes: { customProperties: { score: 5 } } },
      { id: 'db-gamma', changes: { customProperties: { score: 7 } } },
    ],
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 关联分数：12', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 关联分数：12', exact: true }),
  ).toBeDisabled();
  await post(request, '/api/papers/batch', {
    changes: [{ id: 'db-gamma', changes: { customProperties: { score: 9 } } }],
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'DB Alpha · 关联分数：14', exact: true }),
  ).toBeVisible();
});
test('compound filters, secondary sorting and named view cloning keep a reusable query', async ({
  page,
  request,
}) => {
  await go(page);
  await page.getByLabel('搜索数据库').fill('Database fixture');
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await page.getByRole('button', { name: '添加条件', exact: true }).click();
  await page.getByLabel('筛选属性').selectOption('year');
  await page.getByLabel('筛选运算').selectOption('gte');
  await page.getByLabel('筛选值').fill('2025');
  await page.getByRole('button', { name: '添加次级排序' }).click();
  await page.getByLabel('排序属性').nth(1).selectOption('title');
  await expect(page.locator('.db-table tbody tr')).toHaveCount(2);
  await page.getByLabel('视图布局').selectOption('list');
  await page.getByRole('button', { name: '新建视图', exact: true }).click();
  await page.getByLabel('视图名称').fill('近两年阅读清单');
  await saved(page, page.getByRole('button', { name: '确认保存' }), '/api/database');
  await expect(page.getByRole('tab', { name: '近两年阅读清单' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page.locator('.db-list > div')).toHaveCount(2);
  const view = (await state(request)).database.views.find((v) => v.name === '近两年阅读清单');
  expect(view.filters.rules[0].value).toBe(2025);
  expect(view.sorts).toHaveLength(2);
});
test('atomic batch change and guarded undo preserve other fields and unsaved cell content', async ({
  page,
  request,
}) => {
  await go(page);
  await page.getByLabel('搜索数据库').fill('Database fixture');
  await saved(page, page.getByRole('button', { name: '保存视图 *', exact: true }), '/api/database');
  await page.getByLabel('选择 DB Alpha', { exact: true }).check();
  await page.getByLabel('选择 DB Beta', { exact: true }).check();
  await page.getByRole('button', { name: 'DB Alpha · 年份：2024', exact: true }).click();
  await page.getByLabel('编辑 年份').fill('2022');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '应用到所选' }).click();
  await expect(page.getByLabel('编辑 年份')).toHaveValue('2022');
  await page.getByRole('button', { name: '取消单元格' }).click();
  await page.getByLabel('批量值').selectOption('reviewed');
  await saved(page, page.getByRole('button', { name: '应用到所选' }), '/api/papers/batch');
  let s = await state(request);
  expect(s.dataset.papers.find((p) => p.id === 'db-alpha').status).toBe('reviewed');
  expect(s.dataset.papers.find((p) => p.id === 'db-beta').status).toBe('reviewed');
  await saved(page, page.getByRole('button', { name: '撤销上次修改' }), '/api/papers/batch');
  s = await state(request);
  expect(s.dataset.papers.find((p) => p.id === 'db-alpha').status).toBe('unread');
  expect(s.dataset.papers.find((p) => p.id === 'db-beta').status).toBe('reading');
  expect(s.dataset.papers.find((p) => p.id === 'db-alpha').year).toBe(2024);
});
test('board dragging persists status and checkbox groups remain distinguishable', async ({
  page,
  request,
}) => {
  await go(page, 'view-reading');
  const card = page
    .locator('.db-card')
    .filter({ has: page.getByRole('button', { name: /^DB Alpha\s*Database/ }) });
  const target = page
    .locator('.db-board-column')
    .filter({ has: page.getByRole('heading', { name: /^阅读中/ }) });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/papers/batch') && r.request().method() === 'POST',
  );
  await card.dragTo(target.locator('h3'), { sourcePosition: { x: 20, y: 15 } });
  expect((await response).status()).toBe(200);
  await expect(target.getByRole('button', { name: /^DB Alpha\s*Database/ })).toBeVisible();
  expect((await state(request)).dataset.papers.find((p) => p.id === 'db-alpha').status).toBe(
    'reading',
  );
  await page.screenshot({ path: shots + '/database-board.png', fullPage: true });
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await page.getByLabel('分组属性').selectOption('custom:ready');
  await expect(page.getByRole('heading', { name: /^未勾选/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^已勾选/ })).toBeVisible();
});
test('calendar uses the chosen custom date and keeps undated records accessible', async ({
  page,
}) => {
  await go(page, 'view-calendar');
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await page.getByLabel('日历日期').selectOption('custom:due');
  await page.getByRole('button', { name: '筛选与布局' }).click();
  await page.getByLabel('跳转月份').fill('2026-09');
  await expect(
    page
      .locator('.db-day')
      .filter({ has: page.getByRole('button', { name: 'DB Alpha', exact: true }) }),
  ).toContainText('24');
  await page.getByText(/未设置日期 ·/).click();
  await expect(
    page.locator('.db-unscheduled-list').getByRole('button', { name: /^DB Beta\s*Database/ }),
  ).toBeVisible();
  await page.screenshot({ path: shots + '/database-calendar.png', fullPage: true });
});
test('stale cell edits cannot overwrite, and direct navigation/back respect unsaved view guards', async ({
  page,
  request,
}) => {
  await go(page);
  await page.getByRole('button', { name: 'DB Alpha · 年份：2024', exact: true }).click();
  await page.getByLabel('编辑 年份').fill('2022');
  await post(request, '/api/papers/batch', {
    changes: [{ id: 'db-alpha', changes: { year: 2023 } }],
  });
  const conflict = page.waitForResponse(
    (r) => r.url().endsWith('/api/papers/batch') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存单元格' }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByLabel('编辑 年份')).toHaveValue('2022');
  await page.getByRole('button', { name: '取消单元格' }).click();
  await page.getByLabel('搜索数据库').fill('Database fixture');
  await page.getByLabel('选择 DB Alpha', { exact: true }).check();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '加入比较', exact: true }).click();
  await expect(page.getByRole('heading', { name: '论文数据库', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/database/);
  await expect(page.getByLabel('搜索数据库')).toHaveValue('Database fixture');
  expect((await state(request)).dataset.papers.find((p) => p.id === 'db-alpha').year).toBe(2023);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('tab', { name: '阅读进度' }).click();
  await expect(page).toHaveURL(/view-reading/);
  await expect(page.getByRole('tab', { name: '阅读进度' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByLabel('搜索数据库').fill('unsaved-back-query');
  page.once('dialog', (d) => d.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/view-reading/);
  await expect(page.getByLabel('搜索数据库')).toHaveValue('unsaved-back-query');
});
test('mobile gallery, keyboard dismissible paper preview and scoped CSV export work without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, 'view-gallery');
  await page.getByLabel('搜索数据库').fill('Database fixture');
  await page.locator('.db-card').first().locator('.db-title-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('papers.csv');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: shots + '/database-mobile.png', fullPage: true });
});

test('view save readback race does not authorize an old draft to overwrite a newer view', async ({
  page,
  request,
}) => {
  await go(page);
  await page.getByLabel('搜索数据库').fill('Database fixture');
  let intercepted = false;
  await page.route('**/api/workspace', async (route) => {
    if (!intercepted) {
      intercepted = true;
      const current = await state(request);
      current.database.views[0].name = 'Concurrent newer view';
      await post(request, '/api/database', { database: current.database });
    }
    await route.continue();
  });
  await page.getByRole('button', { name: '保存视图 *', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('此次保存已成功');
  await expect(page.getByLabel('搜索数据库')).toHaveValue('Database fixture');
  const conflict = page.waitForResponse(
    (r) => r.url().endsWith('/api/database') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存视图 *', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  expect((await state(request)).database.views[0].name).toBe('Concurrent newer view');
});
