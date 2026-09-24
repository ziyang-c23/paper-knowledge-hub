import { test, expect } from '@playwright/test';
test('static Pages projection has honest resources, diagrams and no local actions', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/paper/octo');
  await expect(page.getByRole('region', { name: '交互式方法解释' })).toBeVisible();
  await expect(page.getByRole('link', { name: '编辑论文', exact: true })).toHaveCount(0);
  await page.getByLabel('实验条件', { exact: true }).selectOption('octo-finetune');
  await page.getByLabel('实验任务', { exact: true }).selectOption('Coffee');
  await expect(page.locator('.result-table tbody tr')).toHaveCount(3);
  await page
    .getByRole('navigation', { name: '阅读模式' })
    .getByRole('link', { name: '阅读笔记', exact: true })
    .click();
  await expect(page.locator('#paper-note')).toBeVisible();
  expect(await page.locator('#paper-note a[href*="/api/documents/"]').count()).toBe(0);
  expect(await page.locator('#paper-note a[href*="#/document/"]').count()).toBe(0);
  expect(errors).toEqual([]);
});
test('public mobile chapter drawer works at 320px without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await page.goto('./#/paper/octo?mode=note');
  await page.getByText('章节目录', { exact: true }).click();
  await page
    .getByRole('navigation', { name: '手机笔记目录' })
    .getByRole('button', { name: '方法', exact: true })
    .click();
  await expect(page).toHaveURL(/section=note-/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
});

test('public research search uses only the static projection and keeps chapter links', async ({
  page,
}) => {
  const apiRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('./#/research?q=diffusion&scope=notes');
  await expect(page.locator('.search-result').first()).toBeVisible();
  await expect(page.locator('.search-result .result-title').first()).toHaveAttribute(
    'href',
    /mode=note.*section=/,
  );
  expect(apiRequests).toEqual([]);
});
