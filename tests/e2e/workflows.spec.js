import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const screenshotDir = 'artifacts/screenshots';
const v1Generated = JSON.parse(await readFile('src/generated/public.json', 'utf8'));
const hasV1Seed = [
  'openvla',
  'rt-2',
  'octo',
  'dreamerv3',
  'rt-1',
  'saycan',
  'palm-e',
  'voyager',
  'transformer-xl',
].every((id) => v1Generated.papers.some((p) => p.id === id));
test.beforeEach(() => {
  test.skip(
    !hasV1Seed,
    'V1 nine-paper regression requires the original public demo; selected-public package may intentionally omit it.',
  );
});
test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});
test('A: Chinese and English search, filters, count and refresh preserve URL', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: '把阅读连接成研究' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotDir + '/overview.png', fullPage: true });
  await page.screenshot({ path: screenshotDir + '/overview-viewport.png' });
  await page.getByRole('link', { name: '已审核关系 27 查看来源与连接' }).click();
  await expect(page.locator('.edge-row')).toHaveCount(27);
  await page.getByRole('link', { name: '论文库 9', exact: true }).click();
  await page.getByLabel('搜索标题、简称、作者、标签或笔记').fill('VLA');
  await expect(page.locator('.paper-row')).not.toHaveCount(0);
  await page.getByLabel('年份', { exact: true }).selectOption('2024');
  await page.getByLabel('阅读状态', { exact: true }).selectOption('reviewed');
  await expect(page.locator('.paper-row')).toHaveCount(1);
  await expect(page.locator('.paper-row')).toContainText('OpenVLA');
  await page.reload();
  await expect(page.getByLabel('年份', { exact: true })).toHaveValue('2024');
  await expect(page.locator('.paper-row')).toHaveCount(1);
  await page.getByRole('button', { name: '清空筛选' }).click();
  await page.getByLabel('搜索标题、简称、作者、标签或笔记').fill('记忆');
  await expect(page.locator('.paper-row')).not.toHaveCount(0);
  await page.getByLabel('搜索标题、简称、作者、标签或笔记').fill('不存在的研究词abcdef');
  await expect(page.getByRole('heading', { name: '没有找到结果' })).toBeVisible();
  await page.getByRole('button', { name: '清空筛选' }).click();
  await page.getByLabel('搜索标题、简称、作者、标签或笔记').fill('Moo Jin Kim');
  await expect(page.locator('.paper-row')).toContainText('OpenVLA');
  expect(errors).toEqual([]);
});
test('B: Select three papers, compare unknowns, export markdown', async ({ page }) => {
  await page.goto('./#/library');
  for (const name of ['OpenVLA', 'RT-2', 'DreamerV3'])
    await page.getByRole('checkbox', { name: '选择比较 ' + name, exact: true }).check();
  await page.getByRole('link', { name: '打开比较' }).click();
  await expect(page.locator('.comparison-table thead th')).toHaveCount(4);
  await expect(page.locator('.comparison-table')).toContainText('评测条件');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  const d = await download;
  const body = await readFile(await d.path(), 'utf8');
  expect(body).toContain('OpenVLA');
  expect(body).toContain('关键假设');
  expect(body).toContain('来源');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotDir + '/comparison.png', fullPage: true });
  await page.goto('./#/compare?ids=saycan,octo');
  await expect(page.locator('.comparison-table')).toContainText('未知 / 未整理');
});
test('C: Detail, evidence, graph node and edge, pending relation separation', async ({ page }) => {
  await page.goto('./#/paper/openvla');
  await expect(
    page.getByRole('heading', {
      name: 'OpenVLA: An Open-Source Vision-Language-Action Model',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '证据与来源', exact: false })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotDir + '/paper-detail.png', fullPage: true });
  const d = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出笔记', exact: true }).click();
  const noteDownload = await d;
  expect(noteDownload.suggestedFilename()).toBe('openvla.md');
  const noteExport = await readFile(await noteDownload.path(), 'utf8');
  expect(noteExport).toContain('模型辅助 / 待核验');
  expect(noteExport).toContain('未提供来源（不可视为原文支持）');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '复制引用', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'OpenVLA: An Open-Source',
  );
  await page.getByRole('link', { name: '打开局部关系图' }).click();
  await expect(page.locator('.graph-node')).not.toHaveCount(0);
  await page.locator('.edge-row').first().click();
  await expect(page.getByRole('heading', { name: '关系依据' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('status')).toHaveText('');
  await page.screenshot({ path: screenshotDir + '/relations.png', fullPage: true });
  await page
    .getByRole('link', { name: /打开证据/ })
    .first()
    .click();
  await expect(page.locator('[id^=evidence-]').first()).toBeAttached();
  await expect(page).toHaveURL(/evidence=/);
  await page.goto('./#/graph?node=openvla&hops=2');
  await page.locator('.edge-row').first().click();
  await page.locator('.graph-node').first().press('Enter');
  await expect(page.getByRole('heading', { name: '节点详情', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '打开详情', exact: true }).click();
  await expect(page).not.toHaveURL(/#\/graph/);
  await page.goto('./#/graph?review=pending');
  await expect(page.getByText('候选关系不进入图扩展', { exact: true })).toBeVisible();
  await expect(page.locator('.edge-row')).toHaveCount(1);
  await page.goto('./#/graph?node=openvla&type=extends');
  await expect(page.getByRole('heading', { name: '当前论文没有匹配关系' })).toBeVisible();
});
test('E: Query direct vs approved graph expansion; no evidence and no model states', async ({
  page,
}) => {
  await page.goto('./#/query?q=OpenVLA');
  await expect(page.locator('.search-result')).toHaveCount(3);
  await page.getByRole('checkbox', { name: '沿已审核关系扩展（最多两跳）' }).check();
  await expect(page.locator('.search-result')).toHaveCount(7);
  await expect(page.getByRole('heading', { name: '关系扩展结果' })).toBeVisible();
  await expect(page.getByText('未配置', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotDir + '/evidence-query.png', fullPage: true });
  await page.getByLabel('输入关键词，如 VLA、记忆、latent dynamics').fill('zzzz-no-evidence');
  await expect(page.getByRole('heading', { name: '没有找到证据' })).toBeVisible();
  await expect(page.locator('.model-answer')).toHaveCount(0);
  await page.goto('./#/paper/%invalid');
  await expect(page.getByRole('heading', { name: '论文不存在' })).toBeVisible();
});
test('D: Browser draft persisted locally and exported schema-shaped private JSON', async ({
  page,
}) => {
  await page.goto('./#/manage');
  await page.getByLabel('论文英文名称', { exact: true }).fill('TEST ONLY Synthetic Fixture');
  await page.getByLabel('稳定 ID', { exact: true }).fill('browser-test-fixture');
  await page.getByLabel('作者', { exact: true }).fill('Test Author');
  await page.getByLabel('原文链接', { exact: true }).fill('https://example.org/test-only');
  await page
    .getByLabel('笔记正文', { exact: true })
    .fill('## TEST ONLY\nThis is a synthetic test fixture.');
  await page.getByRole('button', { name: '保存浏览器草稿', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('尚未写入主库');
  await page.reload();
  await expect(page.getByLabel('稳定 ID', { exact: true })).toHaveValue('browser-test-fixture');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出标准 JSON' }).click();
  const value = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(value.id).toBe('browser-test-fixture');
  expect(value.visibility).toBe('private');
  expect(value.note).toContain('TEST ONLY');
  await page.getByRole('button', { name: '清空草稿', exact: true }).click();
  await expect(page.getByLabel('稳定 ID', { exact: true })).toHaveValue('');
});
test('F: Project subpath, asset requests, mobile/200% layout, keyboard and console', async ({
  page,
}) => {
  const errors = [],
    failed = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/api/status')) failed.push(r.url());
  });
  await page.goto('./#/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library');
  await expect(page.getByRole('button', { name: '打开导航' })).toBeVisible();
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('link', { name: '研究概览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '把阅读连接成研究' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotDir + '/mobile.png', fullPage: true });
  for (const route of [
    'library',
    'paper/openvla',
    'graph?node=openvla',
    'compare?ids=openvla,rt-2',
    'topics',
    'query?q=VLA',
    'manage',
  ]) {
    await page.goto('./#/' + route);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      route,
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('./#/library');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
test('Model UI contract only: filters, consent, remote images blocked and stale response ignored', async ({
  page,
}) => {
  await page.route('**/api/status', (r) => r.fulfill({ json: { configured: true } }));
  let sent;
  await page.route('**/api/ask', async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({
      json: {
        answer:
          'Contract fixture answer ![do not load](https://example.org/tracking.png) [ev-openvla-method]',
        evidence: [],
        mode: 'mock-contract',
      },
    });
  });
  await page.goto('./#/query?q=OpenVLA&topic=topic-vla&year=2024&status=reviewed');
  await expect(page.getByRole('button', { name: '基于证据生成回答' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /同意把当前查询/ }).check();
  await page.getByRole('button', { name: '基于证据生成回答' }).click();
  await expect(page.locator('.model-answer')).toContainText('Contract fixture');
  expect(sent.filters).toEqual({
    topic: 'topic-vla',
    year: '2024',
    status: 'reviewed',
    relationType: '',
  });
  await expect(page.locator('.model-answer img')).toHaveCount(0);
  await page.unroute('**/api/ask');
  await page.route('**/api/ask', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await r.fulfill({ json: { answer: 'STALE CONTRACT RESPONSE', evidence: [] } });
    } catch {}
  });
  await page.getByRole('button', { name: '基于证据生成回答' }).click();
  await page.getByLabel('输入关键词，如 VLA、记忆、latent dynamics').fill('no-evidence-next');
  await expect(page.locator('.model-answer')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有找到证据' })).toBeVisible();
});

test('D/E full loop in isolated library: import, rebuild, statistics, note, search, graph and private artifact scan', async ({
  page,
}) => {
  test.setTimeout(60000);
  const fs = await import('node:fs/promises'),
    path = await import('node:path'),
    os = await import('node:os'),
    http = await import('node:http'),
    { execFile } = await import('node:child_process'),
    { promisify } = await import('node:util');
  const exec = promisify(execFile),
    root = process.cwd(),
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-hub-browser-loop-'));
  let server;
  try {
    for (const item of [
      'src',
      'scripts',
      'services',
      'schemas',
      'content',
      'index.html',
      'vite.config.js',
      'site.config.json',
      'package.json',
    ])
      await fs.cp(path.join(root, item), path.join(temp, item), { recursive: true });
    await fs.symlink(
      path.join(root, 'node_modules'),
      path.join(temp, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await fs.mkdir(path.join(temp, 'private'), { recursive: true });
    const secret = await fs.readFile('tests/fixtures/private-marker.json', 'utf8');
    await fs.writeFile(path.join(temp, 'private', 'note.json'), secret);
    await fs.writeFile(
      path.join(temp, '.env'),
      'MODEL_API_KEY=sk-TEST_ONLY_NEVER_A_REAL_CREDENTIAL_97d1\n',
    );
    const fixture = path.join(root, 'tests/fixtures/daily-import.json');
    let r = await exec(process.execPath, ['scripts/import.mjs', fixture], { cwd: temp });
    expect(JSON.parse(r.stdout).mode).toBe('dry-run');
    r = await exec(process.execPath, ['scripts/import.mjs', fixture, '--write'], { cwd: temp });
    expect(JSON.parse(r.stdout).additions).toHaveLength(3);
    r = await exec(process.execPath, ['scripts/import.mjs', fixture, '--write'], { cwd: temp });
    expect(JSON.parse(r.stdout).duplicates).toHaveLength(3);
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: temp });
    await exec(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
      cwd: temp,
    });
    const files = await fs.readdir(path.join(temp, 'dist'), {
      recursive: true,
      withFileTypes: true,
    });
    for (const file of files)
      if (file.isFile()) {
        const buffer = await fs.readFile(path.join(file.parentPath, file.name));
        expect(
          buffer.includes(Buffer.from('TEST_ONLY_PRIVATE_MARKER_79f3ac')),
          file.name,
        ).toBeFalsy();
        expect(
          buffer.includes(Buffer.from('sk-TEST_ONLY_NEVER_A_REAL_CREDENTIAL_97d1')),
          file.name,
        ).toBeFalsy();
      }
    const generated = await fs.readFile(path.join(temp, 'src/generated/public.json'), 'utf8');
    expect(generated).not.toContain('TEST_ONLY_PRIVATE_MARKER');
    expect(JSON.parse(generated).papers).toHaveLength(10);
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };
    server = http.createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const file = path.join(temp, 'dist', pathname === '/' ? 'index.html' : pathname);
        const bytes = await fs.readFile(file);
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.end(bytes);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(base + '#/');
    await expect(page.getByRole('link', { name: '入库论文 10 全部研究记录' })).toBeVisible();
    await page.goto(base + '#/library?q=loopmarker');
    await expect(page.locator('.paper-row')).toHaveCount(1);
    await page.getByRole('link', { name: '查看笔记' }).click();
    await expect(page.locator('.markdown')).toContainText('此数据仅用于测试');
    await expect(page.locator('.markdown table')).toHaveCount(1);
    await expect(page.locator('.katex')).toHaveCount(1);
    await page.goto(base + '#/query?q=loopmarker');
    await expect(page.locator('.search-result')).toContainText(
      'TEST ONLY — Synthetic Workflow Fixture',
    );
    await page.goto(base + '#/graph?node=test-only-loop');
    await expect(page.locator('.edge-row')).toHaveCount(1);
    await expect(page.locator('.edge-row')).toContainText('VLA');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
});
