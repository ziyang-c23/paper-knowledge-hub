import { test, expect } from '@playwright/test';
async function fixture(page, prediction, execution, representation) {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.dataset.papers[0].visuals = {
      method: {
        title: 'Teaching fixture',
        steps: [
          {
            id: 'execute',
            label: '执行',
            description: 'Fixture only',
            source: { url: 'https://example.org/paper.pdf', locator: 'Appendix' },
          },
        ],
        timeline: { prediction, execution, description: 'Isolated test protocol' },
        ...(representation ? { representation } : {}),
      },
    };
    await route.fulfill({ json: data });
  });
  await page.goto('/#/paper/octo');
}
test('closed loop preserves executed actions and replaces only unexecuted predictions', async ({
  page,
}) => {
  await fixture(page, 16, 6);
  const cycle = page.getByRole('region', { name: '预测与执行讲解' });
  await cycle.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(cycle.locator('.cycle-cell.planned')).toHaveCount(16);
  await cycle.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(cycle.locator('.cycle-cell.done')).toHaveCount(6);
  await cycle.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(cycle.locator('.cycle-cell.unused')).toHaveCount(10);
  await cycle.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(cycle.locator('.cycle-cell.new')).toHaveCount(16);
  await expect(cycle.locator('.cycle-cell.done')).toHaveCount(6);
  await cycle.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(cycle.locator('.cycle-cell.new')).toHaveCount(0);
  await cycle.getByRole('button', { name: '播放闭环讲解' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cycle.getByRole('button', { name: '播放闭环讲解' })).toBeDisabled();
  await expect(cycle.getByRole('button', { name: '下一步', exact: true })).toBeEnabled();
});
test('single step token teaching retains endpoint semantics at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await fixture(page, 1, 1, {
    convention: 'openvla-tokenizer',
    bins: 256,
    description: 'Static code fixture',
    source: { url: 'https://example.org/code', locator: 'Fixed commit' },
  });
  const slider = page.getByLabel('示意归一化动作值', { exact: true });
  await slider.focus();
  await slider.press('End');
  const encoding = page.getByRole('region', { name: '动作表示讲解' });
  await expect(encoding).toContainText('V − 256');
  await expect(encoding).toContainText('255 个中心');
  const cycle = page.getByRole('region', { name: '预测与执行讲解' });
  await cycle.getByRole('button', { name: '3 执行窗口' }).click();
  await expect(cycle).toContainText('单步');
  await expect(cycle.locator('.cycle-cell.done')).toHaveCount(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
});

test('source media is opt-in, preserves timestamp zero, and offers an error fallback', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.dataset.papers[0].media = [
      {
        id: 'fixture-media',
        type: 'video',
        url: 'https://example.org/fixture.mp4',
        caption: '测试媒体',
        start: 0,
        end: 4,
        observation: '合成测试素材',
      },
    ];
    await route.fulfill({ json: data });
  });
  await page.route('https://example.org/fixture.mp4', (route) => route.abort());
  await page.goto('/#/paper/octo');
  const media = page.locator('.source-media');
  await expect(media.locator('video')).toHaveCount(0);
  await expect(media).toContainText('0 秒–4 秒');
  await media.getByRole('button', { name: '加载来源视频（访问外部网站）' }).click();
  await expect(media.getByRole('alert')).toContainText('媒体暂时无法加载');
  await expect(media.getByRole('link', { name: '在来源打开 ↗' })).toHaveAttribute(
    'href',
    'https://example.org/fixture.mp4',
  );
  await media.getByRole('button', { name: '重新选择加载' }).click();
  await expect(media.getByRole('button', { name: '加载来源视频（访问外部网站）' })).toBeVisible();
});

test('topic and reading-record search preserve their actual destinations', async ({ page }) => {
  const record = {
    id: 'reading-fixture',
    text: 'retainedquery 需要继续检查控制频率',
    page: '2',
    createdAt: '2026-01-01T00:00:00Z',
  };
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.readingRecords = [{ paperId: 'octo', revision: 'fixture', entries: [record] }];
    data.dataset.topics[0].analysis = 'topicquery 专题独立的研究分析';
    await route.fulfill({ json: data });
  });
  await page.route('**/api/reading-records?paperId=octo', (route) =>
    route.fulfill({ json: { paperId: 'octo', revision: 'fixture', entries: [record] } }),
  );
  await page.goto('/#/research?q=retainedquery&scope=reading');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.locator('.search-result .result-title').click();
  await expect(page).toHaveURL(/record=reading-fixture/);
  await expect(page.locator('#reading-record-reading-fixture')).toBeInViewport();
  await page.goto('/#/research?q=topicquery&scope=topics');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.locator('.search-result .result-title').click();
  await expect(page).toHaveURL(/#\/topic\//);
});
