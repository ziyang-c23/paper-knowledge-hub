import { test, expect } from '@playwright/test';

test('topic matrix filters dimensions, selects columns and opens the next reading action', async ({
  page,
  request,
}) => {
  let state = await (await request.get('/api/workspace')).json();
  const id = 'matrix-paper-' + Date.now();
  const paper = {
    schemaVersion: 1,
    id,
    title: 'Matrix workflow paper',
    year: 2025,
    authors: ['Research Team'],
    url: 'https://example.com/' + id,
    visibility: 'private',
    lifecycle: 'active',
    status: 'unread',
    topics: ['topic-vla'],
    note: '## Reading note\n\nPending structured fields.',
  };
  const saved = await request.post('/api/records', {
    headers: { 'X-Workspace-Token': state.csrfToken },
    data: { collection: 'papers', record: paper, expectedRevision: state.revision },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();

  await page.goto('/#/topic/topic-vla');
  await expect(page.getByRole('heading', { name: '专题比较矩阵', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Octo', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Matrix workflow paper', exact: true }),
  ).toBeVisible();

  await page.getByLabel('矩阵研究维度').selectOption('dataset');
  await expect(page.getByRole('row', { name: /数据集/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /模型架构/ })).toHaveCount(0);

  await page.getByLabel('选择比较 Octo').check();
  await expect(page.locator('output[aria-live="polite"]')).toHaveText('已选 1 / 4 篇');
  await page.getByRole('link', { name: '比较所选论文', exact: true }).click();
  await expect(page).toHaveURL(/#\/compare\?ids=octo$/);

  await page.goBack();
  await expect(page.getByRole('heading', { name: '专题比较矩阵', exact: true })).toBeVisible();
  await page.getByLabel('矩阵研究维度').selectOption('');
  await page.getByLabel('只看含未整理项的维度').check();
  await page.getByLabel(/Matrix workflow paper · 研究问题未整理/).click();
  await expect(page).toHaveURL(new RegExp('#/edit/' + id + '$'));
});
