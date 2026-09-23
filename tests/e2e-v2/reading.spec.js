import { test, expect } from '@playwright/test';

async function readingFixture(page, request) {
  const state = await (await request.get('/api/workspace')).json();
  const paper = (id, note) => ({
    schemaVersion: 1,
    id,
    title: id,
    acronym: id,
    year: 2025,
    authors: [],
    url: 'https://example.com/' + id,
    visibility: 'private',
    lifecycle: 'active',
    topics: [],
    status: 'reading',
    note,
  });
  await page.route('**/api/workspace', (route) =>
    route.fulfill({
      json: {
        ...state,
        documents: [],
        dataset: {
          schemaVersion: 1,
          papers: [
            paper(
              'reader-a',
              '## Real **heading**\n\n```python\n# Fake code heading\n```\n\nSetext section\n--------------\n\n[Next paper](#/paper/reader-b?mode=source)',
            ),
            paper('reader-b', '## Second paper\n\nIndependent reading record.'),
          ],
          topics: [],
          concepts: [],
          relations: [],
          evidence: [],
        },
      },
    }),
  );
}

test('outline follows rendered headings in both note and source modes', async ({
  page,
  request,
}) => {
  await readingFixture(page, request);
  await page.goto('/#/paper/reader-a?mode=note');
  const outline = page.getByRole('navigation', { name: '笔记目录' });
  await expect(outline.getByRole('button', { name: 'Real heading', exact: true })).toBeVisible();
  await expect(outline.getByRole('button', { name: 'Setext section', exact: true })).toBeVisible();
  await expect(outline.getByRole('button', { name: 'Fake code heading' })).toHaveCount(0);
  await outline.getByRole('button', { name: 'Setext section' }).click();
  await expect(
    page.locator('.note-panel').getByRole('heading', { name: 'Setext section' }),
  ).toBeInViewport();
  await page.goto('/#/paper/reader-a?mode=source');
  await outline.getByRole('button', { name: 'Setext section' }).click();
  await expect(
    page
      .getByRole('region', { name: '并排阅读笔记' })
      .getByRole('heading', { name: 'Setext section' }),
  ).toBeInViewport();
});

test('browser notes ignore invalid saved rows and never carry unsaved text into another paper', async ({
  page,
  request,
}) => {
  await readingFixture(page, request);
  await page.addInitScript(() => {
    localStorage.setItem(
      'pkh-reader-notes-reader-a',
      JSON.stringify([
        null,
        {},
        { id: 'bad', page: {}, text: [] },
        { id: 'ok', page: '未标页', text: 'Valid stored note' },
      ]),
    );
  });
  await page.goto('/#/paper/reader-a?mode=source');
  await expect(page.getByText('Valid stored note', { exact: true })).toBeVisible();
  await expect(page.getByText('未标页码', { exact: true })).toBeVisible();
  await page.getByLabel('阅读记录内容').fill('Do not carry this draft');
  await page
    .getByRole('region', { name: '并排阅读笔记' })
    .getByRole('link', { name: 'Next paper' })
    .click();
  await expect(page.getByLabel('阅读记录内容')).toHaveValue('');
  await expect(page.getByText('Valid stored note', { exact: true })).toHaveCount(0);
  await page.getByLabel('阅读记录内容').fill('Second paper saved record');
  await page.getByRole('button', { name: '保存阅读记录' }).click();
  await page.reload();
  await expect(page.getByText('Second paper saved record', { exact: true })).toBeVisible();
});

test('failed browser persistence leaves the reading draft available', async ({ page, request }) => {
  await readingFixture(page, request);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pkh-reader-notes-')) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/#/paper/reader-a?mode=source');
  await page.getByLabel('阅读记录内容').fill('Keep this draft');
  await page.getByRole('button', { name: '保存阅读记录' }).click();
  await expect(page.getByRole('alert')).toContainText('浏览器无法保存记录');
  await expect(page.getByLabel('阅读记录内容')).toHaveValue('Keep this draft');
  await expect(page.locator('.reader-note-list')).toHaveCount(0);
});

test('public reader uses external source guidance and separates browser notes from the local workspace', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:4177/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace('<script>window.__PKH_LOCAL__=true</script>', ''),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'pkh-reader-notes-octo',
      JSON.stringify([{ id: 'local', page: '1', text: 'Local workspace record' }]),
    );
    localStorage.setItem(
      'pkh-public-reader-notes-octo',
      JSON.stringify([{ id: 'public', page: '1', text: 'Public browser record' }]),
    );
  });
  await page.goto('/#/paper/octo?mode=source');
  await expect(page.getByRole('heading', { name: '阅读论文原文', exact: true })).toBeVisible();
  await expect(page.getByText('Public browser record', { exact: true })).toBeVisible();
  await expect(page.getByText('Local workspace record', { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href^="/api/documents/"]')).toHaveCount(0);
});

test('editor template fills only an empty note without overwriting existing work', async ({
  page,
  request,
}) => {
  await readingFixture(page, request);
  await page.goto('/#/edit/reader-a');
  const note = page.getByLabel('笔记正文');
  const existing = await note.inputValue();
  await expect(page.getByRole('button', { name: '使用精读模板' })).toBeDisabled();
  await expect(note).toHaveValue(existing);
  await note.fill('');
  await page.getByRole('button', { name: '使用精读模板' }).click();
  await expect(note).toHaveValue(
    /## 背景与研究脉络[\s\S]*## 方法与机制[\s\S]*## 实验与结果分析[\s\S]*## 讨论与启发[\s\S]*## 资源与复核/,
  );
  await expect(page.getByRole('button', { name: '使用精读模板' })).toBeDisabled();
});
