import { test, expect } from '@playwright/test';

async function matrixFixture(page, request) {
  const state = await (await request.get('/api/workspace')).json();
  const topic = (id) => ({ schemaVersion: 1, id, title: id, visibility: 'private' });
  const paper = (id, topicId, extra = {}) => ({
    schemaVersion: 1,
    id,
    title: id,
    acronym: id,
    year: 2025,
    authors: [],
    url: 'https://example.com/' + id,
    visibility: 'private',
    lifecycle: 'active',
    topics: [topicId],
    note: '## Notes\n\nSynthetic reading fixture.',
    ...extra,
  });
  const dataset = {
    schemaVersion: 1,
    papers: [
      paper('matrix-a', 'matrix-topic-a', { facets: { architecture: ['matrix-method'] } }),
      paper('matrix-b', 'matrix-topic-b', { facets: { architecture: ['matrix-method'] } }),
      paper('matrix-c', 'matrix-topic-a'),
      paper('matrix-archived', 'matrix-topic-a', { lifecycle: 'archived' }),
    ],
    topics: [
      { ...topic('matrix-topic-a'), compareIds: ['matrix-a', 'matrix-b', 'matrix-archived'] },
      { ...topic('matrix-topic-b'), compareIds: ['matrix-b'] },
      topic('matrix-topic-empty'),
    ],
    concepts: [
      {
        schemaVersion: 1,
        id: 'matrix-method',
        title: 'Matrix method',
        kind: 'method',
        visibility: 'private',
      },
    ],
    evidence: [],
    relations: [],
  };
  await page.route('**/api/workspace', (route) =>
    route.fulfill({ json: { ...state, dataset, documents: [] } }),
  );
}

test('matrix excludes archived and unrelated selections, links objects and missing fields', async ({
  page,
  request,
}) => {
  await matrixFixture(page, request);
  await page.goto('/#/topic/matrix-topic-a');
  const matrix = page.getByRole('region', { name: '专题比较矩阵', exact: true });
  await expect(matrix.getByRole('checkbox', { name: '选择比较 matrix-archived' })).toHaveCount(0);
  await expect(matrix.locator('output')).toHaveText('已选 1 / 4 篇');
  await expect(matrix.getByRole('link', { name: '比较所选论文' })).toHaveAttribute(
    'href',
    '#/compare?ids=matrix-a',
  );
  await matrix.getByLabel('矩阵研究维度').selectOption('architecture');
  await expect(matrix.getByRole('rowheader', { name: '数据集', exact: true })).toHaveCount(0);
  await expect(matrix.getByRole('link', { name: 'Matrix method', exact: true })).toHaveAttribute(
    'href',
    '#/entities/matrix-method',
  );
  await matrix.getByRole('checkbox', { name: '选择比较 matrix-c' }).check();
  await matrix.getByRole('link', { name: '比较所选论文' }).click();
  await expect(page).toHaveURL(/#\/compare\?ids=matrix-a,matrix-c$/);
  await page.goBack();
  await matrix.getByLabel('矩阵研究维度').selectOption('architecture');
  await matrix.getByRole('link', { name: 'matrix-c · 模型架构未整理' }).click();
  await expect(page).toHaveURL(/#\/edit\/matrix-c$/);
});

test('changing topics resets filters and loads that topic selection', async ({ page, request }) => {
  await matrixFixture(page, request);
  await page.goto('/#/topic/matrix-topic-a');
  const matrix = page.getByRole('region', { name: '专题比较矩阵', exact: true });
  await matrix.getByLabel('矩阵研究维度').selectOption('dataset');
  await matrix.getByLabel('只看含未整理项的维度').check();
  await matrix.getByRole('button', { name: '清空选择' }).click();
  await page.locator('.sidebar-topics').getByRole('link', { name: 'matrix-topic-b' }).click();
  await expect(matrix.getByLabel('矩阵研究维度')).toHaveValue('');
  await expect(matrix.getByLabel('只看含未整理项的维度')).not.toBeChecked();
  await expect(matrix.getByRole('checkbox', { name: '选择比较 matrix-b' })).toBeChecked();
  await expect(matrix.getByRole('link', { name: '比较所选论文' })).toHaveAttribute(
    'href',
    '#/compare?ids=matrix-b',
  );
});

test('complete filtered dimensions keep column selection usable and empty topic has no comparison link', async ({
  page,
  request,
}) => {
  await matrixFixture(page, request);
  await page.goto('/#/topic/matrix-topic-b');
  const matrix = page.getByRole('region', { name: '专题比较矩阵', exact: true });
  await matrix.getByLabel('矩阵研究维度').selectOption('architecture');
  await matrix.getByLabel('只看含未整理项的维度').check();
  await expect(matrix.getByText('当前维度已整理，可切换维度或关闭筛选。')).toBeVisible();
  await matrix.getByRole('checkbox', { name: '选择比较 matrix-b' }).uncheck();
  await expect(matrix.getByRole('button', { name: '比较所选论文' })).toBeDisabled();
  await page.locator('.sidebar-topics').getByRole('link', { name: 'matrix-topic-empty' }).click();
  await expect(matrix.getByRole('heading', { name: '专题尚未收录论文' })).toBeVisible();
  await expect(matrix.getByRole('link', { name: /比较/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '按专题论文继续比较' })).toHaveCount(0);
  await expect(page.getByText('代表性来源 (0)')).toHaveCount(0);
});
