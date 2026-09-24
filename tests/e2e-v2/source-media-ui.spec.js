import { test, expect } from '@playwright/test';

const fixtureImage =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="#e8eee9"/><text x="40" y="200" font-size="32">Observation → Policy → Action</text></svg>';

test('source image keeps original caption, adds reading guidance, and restores focus after enlargement', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.dataset.papers[0].media = [
      {
        id: 'image-ui-fixture',
        type: 'figure',
        url: 'https://example.org/figure.png',
        sourceUrl: 'https://example.org/project',
        caption: '方法总览',
        originalCaption: 'Figure 2. Overview of the policy.',
        readingGuide: '先观察输入、动作和反馈的方向，再回到正文核对训练目标。',
        alt: '方法总览示意图',
      },
    ];
    await route.fulfill({ json: data });
  });
  let imageRequests = 0;
  await page.route('https://example.org/figure.png', (route) => {
    imageRequests += 1;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureImage });
  });
  await page.goto('/#/paper/octo');
  const media = page.locator('.source-media').filter({ hasText: '方法总览' });
  await expect(media.getByRole('button', { name: '加载来源图片（访问外部网站）' })).toBeVisible();
  expect(imageRequests).toBe(0);
  await expect(media).not.toContainText('尚未逐段观看');
  await media.getByRole('button', { name: '加载来源图片（访问外部网站）' }).click();
  await expect(media.locator('img.source-figure-image')).toHaveAttribute(
    'src',
    'https://example.org/figure.png',
  );
  await expect(media).toContainText('原文图注');
  await expect(media).toContainText('Figure 2. Overview of the policy.');
  await expect(media).toContainText('读图提示 · 整理者');
  await media.getByRole('button', { name: '放大查看原图' }).focus();
  await media.getByRole('button', { name: '放大查看原图' }).press('Enter');
  const dialog = page.getByRole('dialog', { name: '方法总览' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toBeVisible();
  await expect(dialog.getByRole('link', { name: '在来源打开 ↗' })).toHaveAttribute(
    'href',
    'https://example.org/project',
  );
  await dialog.getByRole('button', { name: '关闭原图' }).click();
  await expect(dialog).toBeHidden();
  await expect(media.getByRole('button', { name: '放大查看原图' })).toBeFocused();
  await media.getByRole('button', { name: '放大查看原图' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(media.getByRole('button', { name: '放大查看原图' })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 720 });
  await media.getByRole('button', { name: '放大查看原图' }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

async function originalMaterialsFixture(page, withVisuals = true) {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const paper = data.dataset.papers[0];
    paper.note = '## 方法\n\n方法正文保留。\n\n## 实验结果与分析\n\n实验正文保留。';
    paper.media = [
      {
        id: 'original-method',
        type: 'figure',
        section: '方法',
        caption: '作者方法总图',
        url: 'https://example.org/method.png',
        sourceUrl: 'https://example.org/project',
        originalCaption: 'Figure 1. Original method.',
        sourceText: 'Official project description.',
        readingGuide: '将原图的动作输出对应到下方逐步讲解。',
      },
      {
        id: 'original-result',
        type: 'pdf-page',
        section: '实验结果与分析',
        caption: '作者结果原表',
        url: 'https://example.org/paper.pdf#page=3',
        documentId: 'fixture-pdf',
        pageIndex: 3,
        originalCaption: 'Table 1. Original results.',
      },
    ];
    paper.visuals = withVisuals
      ? {
          method: {
            title: '辅助方法讲解',
            steps: [{ id: 'input', label: '输入', description: '理解提示' }],
          },
          experiments: [
            {
              id: 'example',
              label: '辅助结果讲解',
              metric: '成功率',
              unit: '%',
              rows: [{ label: 'A', value: 50 }],
              source: { url: 'https://example.org/paper', locator: 'Table 1' },
            },
          ],
        }
      : undefined;
    await route.fulfill({ json: data });
  });
}

test('notes retain original materials at the matching chapter without rewriting body text', async ({
  page,
}) => {
  await originalMaterialsFixture(page);
  await page.goto('/#/paper/octo?mode=note');
  const note = page.locator('.paper-note');
  await expect(note.getByRole('region', { name: '方法 · 原始材料' })).toContainText('作者方法总图');
  await expect(note.getByRole('region', { name: '实验结果与分析 · 原始材料' })).toContainText(
    '作者结果原表',
  );
  await expect(note).toContainText('方法正文保留。');
  await expect(note).toContainText('实验正文保留。');
  await expect(note).toContainText('项目页原文');
  await expect(note.locator('img')).toHaveCount(0);
  await expect(note.locator('canvas')).toHaveCount(0);
  await expect(note.getByRole('link', { name: '对照论文原页 · 第 3 页' })).toHaveAttribute(
    'href',
    '#/paper/octo?mode=source&document=fixture-pdf&page=3',
  );
  const order = await note
    .locator('.markdown')
    .evaluate((node) => [...node.children].map((child) => child.tagName));
  expect(order).toEqual(['H2', 'SECTION', 'P', 'H2', 'SECTION', 'P']);
});

test('overview places original figures and tables before auxiliary explanation', async ({
  page,
}) => {
  await originalMaterialsFixture(page);
  await page.goto('/#/paper/octo');
  const visuals = page.locator('.research-visuals');
  const order = await visuals.evaluate((node) =>
    [...node.children].map((child) => child.getAttribute('aria-label')),
  );
  expect(order).toEqual([
    '方法 · 原始材料',
    '交互式方法解释',
    '实验结果与分析 · 原始材料',
    '条件化实验结果',
  ]);
  await expect(visuals.getByRole('button', { name: '加载论文原页 · 第 3 页' })).toBeVisible();
});

test('original materials remain accessible without generated interactive visuals', async ({
  page,
}) => {
  await originalMaterialsFixture(page, false);
  await page.goto('/#/paper/octo');
  await expect(
    page.locator('.research-visuals').getByRole('region', { name: '方法 · 原始材料' }),
  ).toBeVisible();
  await expect(
    page.locator('.research-visuals').getByRole('region', { name: '实验结果与分析 · 原始材料' }),
  ).toBeVisible();
});
