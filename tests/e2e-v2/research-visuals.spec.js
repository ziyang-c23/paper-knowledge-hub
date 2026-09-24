import { test, expect } from '@playwright/test';
const visuals = {
  guide: 'Fixture explanation for testing only',
  method: {
    title: 'Mechanism fixture',
    steps: [
      { id: 'input', label: 'Input fixture', description: 'Read observations', section: '方法' },
      {
        id: 'head',
        label: 'Head fixture',
        description: 'Predict actions',
        updates: ['pretrain'],
        source: { url: 'https://example.org/paper.pdf', locator: 'Figure 2' },
      },
    ],
    modes: [
      { id: 'pretrain', label: '预训练', description: 'Update policy' },
      { id: 'inference', label: '推理', description: 'No parameter updates' },
    ],
  },
  experiments: [
    {
      id: 'protocol-a',
      label: 'Protocol A',
      task: 'Task A',
      metric: 'Success',
      unit: '%',
      trials: '20',
      source: { url: 'https://example.org/paper.pdf', locator: 'Table 1' },
      rows: [
        { label: 'Method A', value: 80 },
        { label: 'Method B', value: null },
      ],
    },
    {
      id: 'protocol-b',
      label: 'Protocol B',
      task: 'Task B',
      metric: 'Score',
      unit: 'points',
      trials: 'Unknown',
      source: { url: 'https://example.org/paper.pdf', locator: 'Table 2' },
      rows: [{ label: 'Method C', value: 3 }],
    },
  ],
};
test('method modes and conditioned results use one record and reset across papers', async ({
  page,
}) => {
  await page.route('**/api/workspace', async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.dataset.papers[0].visuals = visuals;
    state.dataset.papers[0].note = '## 方法\n\nExplanation';
    await route.fulfill({ json: state });
  });
  await page.goto('/#/paper/octo');
  // The isolated server contains Octo as its public source fixture.
  await expect(page.getByRole('heading', { name: 'Mechanism fixture' })).toBeVisible();
  await page.getByRole('button', { name: '推理', exact: true }).click();
  await expect(page.getByText('No parameter updates')).toBeVisible();
  await expect(page.getByText('参数更新', { exact: true })).toHaveCount(0);
  await expect(page.locator('.result-table')).toContainText('未知');
  await page.getByLabel('实验条件', { exact: true }).selectOption('protocol-b');
  await expect(page.locator('.experiment-protocol')).toContainText('Task B');
  await expect(page.locator('.result-table')).toContainText('Method C');
  await expect(page.locator('.result-table')).not.toContainText('Method A');
  await page.getByRole('link', { name: '阅读对应解释' }).click();
  await expect(page).toHaveURL(/section=note-/);
  await expect(page.locator('#paper-note')).toBeVisible();
});
test('comparison preserves unavailable IDs and the chosen question in its URL', async ({
  page,
}) => {
  await page.goto('/#/compare?ids=octo,not-published&question=history');
  await expect(page.getByRole('alert')).toContainText('not-published');
  await expect(page.getByLabel('比较问题')).toHaveValue('history');
  await page.getByLabel('比较问题').selectOption('adaptation');
  await expect(page).toHaveURL(/question=adaptation/);
  await expect(page.getByRole('alert')).toContainText('not-published');
});

test('library views share query, sort and comparison selection', async ({ page }) => {
  await page.goto('/#/library?q=Octo&sort=oldest');
  await page.getByRole('checkbox', { name: '选择比较 Octo', exact: true }).check();
  const views = page.getByRole('navigation', { name: '文献视图' });
  await views.getByRole('link', { name: '画廊', exact: true }).click();
  await expect(page).toHaveURL(/q=Octo/);
  await expect(page.getByRole('checkbox', { name: '选择比较 Octo', exact: true })).toBeChecked();
  await views.getByRole('link', { name: '表格', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '选择比较 Octo', exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByLabel('排序', { exact: true })).toHaveValue('oldest');
  await expect(page.getByRole('checkbox', { name: '选择比较 Octo', exact: true })).toBeChecked();
});
