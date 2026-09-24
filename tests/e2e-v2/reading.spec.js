import { test, expect } from '@playwright/test';

async function readingFixture(page, request, documents = []) {
  const state = await (await request.get('/api/workspace')).json();
  const records = new Map();
  await page.route('**/api/reading-records**', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      const current = records.get(body.paperId) || {
        paperId: body.paperId,
        revision: 'empty',
        entries: [],
      };
      if (body.expectedRevision !== current.revision)
        return route.fulfill({
          status: 409,
          json: { error: '阅读记录已更新，请重新读取后合并。' },
        });
      const next = {
        paperId: body.paperId,
        revision: String(Number(current.revision) + 1 || 1),
        entries: body.entries,
      };
      records.set(body.paperId, next);
      return route.fulfill({ json: next });
    }
    const paperId = new URL(req.url()).searchParams.get('paperId');
    return route.fulfill({
      json: records.get(paperId) || { paperId, revision: 'empty', entries: [] },
    });
  });
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
        documents,
        dataset: {
          schemaVersion: 1,
          papers: [
            paper(
              'reader-a',
              '## Real **heading**\n\n```python\n# Fake code heading\n```\n\nSetext section\n--------------\n\n[Next paper](#/paper/reader-b?mode=source)\n\n## 附录\n\n### Extended detail\n\nAppendix body remains in the canonical note.',
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
  return records;
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

test('local notes explicitly import valid browser rows and persist without carrying unsaved text into another paper', async ({
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
  await page.getByRole('button', { name: '导入此浏览器旧记录 (1)', exact: true }).click();
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

test('failed local persistence leaves the reading draft available', async ({ page, request }) => {
  await readingFixture(page, request);
  await page.route('**/api/reading-records', (route) =>
    route.fulfill({ status: 503, json: { error: '本地阅读记录未保存，请重试。' } }),
  );
  await page.goto('/#/paper/reader-a?mode=source');
  await page.getByLabel('阅读记录内容').fill('Keep this draft');
  await page.getByRole('button', { name: '保存阅读记录' }).click();
  await expect(page.getByRole('alert')).toContainText('本地阅读记录未保存');
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
    /## 论文概览[\s\S]*## 研究背景与问题定义[\s\S]*## 相关工作[\s\S]*## 方法[\s\S]*## 实验设计[\s\S]*## 实验结果与分析[\s\S]*## 局限性与讨论[\s\S]*## 附录/,
  );
  await expect(page.getByRole('button', { name: '使用精读模板' })).toBeDisabled();
});

test('section links restore after reload and mobile chapter drawer remains usable', async ({
  page,
  request,
}) => {
  await readingFixture(page, request);
  await page.goto('/#/paper/reader-a?mode=note');
  await page
    .getByRole('navigation', { name: '笔记目录', exact: true })
    .getByRole('button', { name: 'Setext section' })
    .click();
  await expect(page).toHaveURL(/section=note-setext-section/);
  await page.reload();
  await expect(page.locator('#note-setext-section')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('章节目录', { exact: true }).click();
  await page
    .getByRole('navigation', { name: '手机笔记目录' })
    .getByRole('button', { name: 'Real heading' })
    .click();
  await expect(page).toHaveURL(/section=note-real-heading/);
  await expect(page.locator('#note-real-heading')).toBeInViewport();
  await expect(page.locator('.mobile-note-outline')).not.toHaveAttribute('open', '');
});

function pdfBytes() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['First page method', 'Second page result'].map((text) => {
      const stream = `BT /F1 20 Tf 40 420 Td (${text}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const offset = Buffer.byteLength(output);
  output +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((value) => String(value).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  return Buffer.from(output);
}

test('PDF reuses its document while paging and zooming, selects text and captures a located question', async ({
  page,
  request,
}) => {
  const records = await readingFixture(page, request, [
    { id: 'reader-pdf', paperId: 'reader-a', filename: 'fixture.pdf', pageCount: 2 },
  ]);
  let loads = 0;
  await page.route('**/api/documents/reader-pdf/file', (route) => {
    loads++;
    return route.fulfill({ contentType: 'application/pdf', body: pdfBytes() });
  });
  await page.goto('/#/paper/reader-a?mode=source');
  await expect(page.locator('.pdf-text-layer')).toContainText('First page method');
  await page.getByLabel('并排原文页序').selectOption('2');
  await expect(page.locator('.pdf-text-layer')).toContainText('Second page result');
  await page.getByRole('button', { name: '放大原文' }).click();
  await expect(page.getByLabel('原文缩放')).toHaveText('125%');
  await expect(page.locator('.pdf-reader [role="status"]')).toHaveCount(0);
  expect(loads).toBe(1);
  await page.getByRole('searchbox', { name: '页内查找' }).fill('result');
  await expect(page.locator('.pdf-search-current')).toContainText('Second page result');
  await page
    .locator('.pdf-text-layer span')
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  await page.getByRole('button', { name: '从选区记录问题' }).click();
  await expect(page.getByLabel('PDF 页码')).toHaveValue('2');
  await page.getByLabel('阅读记录内容').fill('Which condition matters?');
  await page.getByRole('button', { name: '保存阅读记录' }).click();
  await expect(page.locator('.reader-note-list')).toContainText('Second page result');
  await expect(page.getByRole('link', { name: '返回原文页' })).toHaveAttribute(
    'href',
    '#/document/reader-pdf?page=2',
  );
  const saved = records.get('reader-a').entries[0];
  expect(saved.documentId).toBe('reader-pdf');
  expect(saved.pageIndex).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({ path: 'tmp/v2-review/reader-mobile.png', fullPage: true });
});

test('damaged PDF offers retry and original file without losing the note', async ({
  page,
  request,
}) => {
  await readingFixture(page, request, [
    { id: 'broken-pdf', paperId: 'reader-a', filename: 'broken.pdf', pageCount: 1 },
  ]);
  await page.route('**/api/documents/broken-pdf/file', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: 'not a pdf' }),
  );
  await page.goto('/#/paper/reader-a?mode=source');
  await expect(page.locator('.pdf-reader [role="alert"]')).toContainText('无法打开 PDF');
  await expect(page.getByRole('button', { name: '重试 PDF' })).toBeVisible();
  await expect(page.getByRole('region', { name: '并排阅读笔记' })).toContainText('Real heading');
});

test('appendix is folded once and chapter links open it across reloads', async ({
  page,
  request,
}) => {
  await readingFixture(page, request);
  await page.goto('/#/paper/reader-a?mode=note');
  await expect(page.locator('.paper-appendix')).toHaveCount(1);
  await expect(page.locator('.paper-appendix')).not.toHaveAttribute('open', '');
  await page
    .getByRole('navigation', { name: '笔记目录', exact: true })
    .getByRole('button', { name: 'Extended detail', exact: true })
    .click();
  await expect(page.locator('.paper-appendix')).toHaveAttribute('open', '');
  await expect(page.locator('#note-extended-detail')).toBeInViewport();
  await page.reload();
  await expect(page.locator('.paper-appendix')).toHaveAttribute('open', '');
  await expect(page.locator('#note-extended-detail')).toBeInViewport();
  await page.goto('/#/paper/reader-a?mode=source');
  await expect(page.locator('.paper-appendix')).toHaveCount(1);
  await expect(page.locator('.paper-appendix')).not.toHaveAttribute('open', '');
});

test('failed deferred PDF module preserves note and provides an explicit refresh', async ({
  page,
  request,
}) => {
  await readingFixture(page, request, [
    { id: 'reader-pdf', paperId: 'reader-a', filename: 'fixture.pdf', pageCount: 2 },
  ]);
  await page.route('**/assets/pdf-viewer-*.js', (route) => route.abort());
  await page.goto('/#/paper/reader-a?mode=source');
  await expect(page.getByRole('heading', { name: '阅读工具暂时无法加载' })).toBeVisible();
  await expect(page.getByRole('region', { name: '并排阅读笔记' })).toContainText('Real heading');
  await expect(page.getByRole('button', { name: '刷新页面', exact: true })).toBeVisible();
});
