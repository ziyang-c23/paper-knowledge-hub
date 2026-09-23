import { test, expect } from '@playwright/test';
test('draft inbox accepts, edits, applies and opens a durable record', async ({
  page,
  request,
}) => {
  const s = await (await request.get('/api/workspace')).json();
  const id = 'inbox-ui-' + Date.now();
  const record = {
    schemaVersion: 1,
    id,
    title: 'Inbox workflow method',
    kind: 'method',
    visibility: 'private',
    note: '## Reviewed mechanism\n\nUniqueDraftWorkflow',
  };
  const response = await request.post('/api/drafts', {
    headers: { 'X-Workspace-Token': s.csrfToken },
    data: {
      collection: 'concepts',
      record,
      sourceMaterial: ['Synthetic workflow input'],
      uncertainties: ['No scientific claim'],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const d = await response.json();
  await page.goto('/#/drafts?id=' + d.id);
  await expect(
    page.getByRole('heading', { name: 'Inbox workflow method', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '编辑草稿 JSON', exact: true }).click();
  await page
    .getByLabel('草稿内容')
    .fill(JSON.stringify({ ...record, note: '## Reviewed mechanism\n\nUpdatedDraftWorkflow' }));
  await page.getByRole('button', { name: '校验并保存草稿' }).click();
  await expect(page.getByText('UpdatedDraftWorkflow', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '我已检查内容、来源和变更范围' }).check();
  await page.getByRole('button', { name: '应用到知识库' }).click();
  await expect(page.getByRole('status')).toContainText('已写入知识库');
  await page.reload();
  await expect(page.getByText('已应用', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '打开知识库记录' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inbox workflow method', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('UpdatedDraftWorkflow', { exact: true })).toBeVisible();
});

test('selected comparison is saved to a topic and remains after reload', async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const topic = {
    schemaVersion: 1,
    id: 'compare-topic-' + stamp,
    title: 'Comparison workspace',
    visibility: 'private',
  };
  let state = await (await request.get('/api/workspace')).json();
  const saved = await request.post('/api/records', {
    headers: { 'X-Workspace-Token': state.csrfToken },
    data: { collection: 'topics', record: topic, expectedRevision: state.revision },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  state = await (await request.get('/api/workspace')).json();
  const ids = state.dataset.papers.slice(0, 2).map((p) => p.id);
  test.skip(ids.length < 2, 'Empty distributed source package');
  await page.goto('/#/compare?ids=' + ids.join(','));
  await page.getByLabel('保存比较的专题').selectOption(topic.id);
  await page.getByRole('button', { name: '保存比较组合' }).click();
  await expect(page.getByRole('status')).toContainText('比较论文已保存到专题');
  await page.reload();
  state = await (await request.get('/api/workspace')).json();
  expect(state.dataset.topics.find((t) => t.id === topic.id).compareIds).toEqual(ids);
});
