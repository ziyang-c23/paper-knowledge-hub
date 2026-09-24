import { test, expect } from '@playwright/test';
test('AI context and imported section are reviewed without overwriting unrelated fields', async ({
  page,
  request,
}) => {
  let state = await (await request.get('/api/workspace')).json();
  const id = 'ai-browser-fixture';
  const record = {
    schemaVersion: 1,
    id,
    title: 'AI workflow fixture',
    year: 2024,
    authors: [],
    url: 'https://example.org/paper',
    visibility: 'private',
    note: '## 方法\n\nOriginal mechanism\n\n## 附录\n\nKeep source appendix',
    problem: 'Keep human problem',
  };
  const response = await request.post('/api/records', {
    headers: { 'X-Workspace-Token': state.csrfToken },
    data: { collection: 'papers', record, expectedRevision: state.revision },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto('/#/drafts');
  const panel = page.locator('.ai-task-panel');
  await panel.getByRole('checkbox', { name: 'AI workflow fixture', exact: true }).check();
  await panel.getByLabel('章节', { exact: true }).selectOption('mechanism');
  await panel.getByRole('button', { name: '建立整理任务' }).click();
  await panel.getByRole('button', { name: '准备上下文' }).click();
  await expect(panel.getByRole('link', { name: '下载 Agent 上下文' })).toBeVisible();
  await panel.locator('input[type=file]').setInputFiles({
    name: 'result.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ sectionText: 'Reviewed mechanism from imported Agent output' }),
    ),
  });
  await panel.getByRole('link', { name: '审阅改动' }).click();
  await page.reload();
  await expect(page.locator('.draft-field-diff').filter({ hasText: '采纳 note' })).toContainText(
    'Original mechanism',
  );
  await page.getByRole('checkbox', { name: '我已检查内容、来源和变更范围' }).check();
  await page.getByRole('button', { name: '应用到知识库' }).click();
  await expect(page.getByRole('status')).toContainText('已写入知识库');
  state = await (await request.get('/api/workspace')).json();
  const saved = state.dataset.papers.find((p) => p.id === id);
  expect(saved.note).toContain('Reviewed mechanism');
  expect(saved.note).toContain('Keep source appendix');
  expect(saved.problem).toBe('Keep human problem');
});
