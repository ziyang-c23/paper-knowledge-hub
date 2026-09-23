import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readWorkspace, safePrivate } from '../services/workspace-store.mjs';
import { comparisonMarkdown, awesomeMarkdown } from '../src/lib/knowledge.mjs';
const args = process.argv.slice(2),
  value = (k) => args[args.indexOf(k) + 1];
try {
  const root = process.cwd(),
    store = await readWorkspace(root),
    ids = (value('--ids') || '').split(',').filter(Boolean),
    out = value('--out');
  if (!args.includes('--ids') || !args.includes('--out') || !ids.length)
    throw Error(
      'Usage: npm run study:export -- --ids ID1,ID2 --out private/exports/comparison.md [--format awesome]',
    );
  const dir = await safePrivate(root),
    target = path.resolve(root, out);
  if (!target.startsWith(dir + path.sep)) throw Error('Local exports must stay under private/');
  if (ids.some((id) => !store.dataset.papers.some((p) => p.id === id)))
    throw Error('Unknown paper ID');
  const papers = ids.map((id) => store.dataset.papers.find((p) => p.id === id));
  let text =
    args.includes('--format') && value('--format') === 'awesome'
      ? awesomeMarkdown(papers)
      : comparisonMarkdown(
          papers,
          JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8')).comparisonFields,
        );
  if (!(args.includes('--format') && value('--format') === 'awesome'))
    text +=
      '\n## 来源与支持范围\n\n' +
      papers
        .map(
          (p) =>
            '### ' +
            p.title +
            '\n\n' +
            store.dataset.evidence
              .filter((e) => e.paperId === p.id)
              .map(
                (e) =>
                  '- [' +
                  e.id +
                  '] ' +
                  e.kind +
                  ' / ' +
                  e.status +
                  ': ' +
                  e.text +
                  '\n  ' +
                  (e.url || '未记录 URL') +
                  '；' +
                  (e.locator || '未记录定位'),
              )
              .join('\n\n'),
        )
        .join('\n\n');
  await mkdir(path.dirname(target), { recursive: true });
  await safePrivate(root);
  await writeFile(target, '<!-- 本地研究材料；分享前审查私有内容 -->\n\n' + text, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    JSON.stringify({ output: out, papers: ids, scope: 'local', revision: store.revision }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
