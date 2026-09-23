import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWorkspace, putRecord, backupWorkspace } from '../services/workspace-store.mjs';
import { NOTE_SECTIONS } from '../src/lib/note-template.mjs';

const originalHeadings = [
  '🔎 论文概览',
  '📒 研究背景与问题定义',
  '📚 相关工作',
  '📐 方法',
  '🧪 实验设计',
  '📊 实验结果与分析',
  '⚖️ 局限性与讨论',
  '🧩 附录',
];
const cleanHeadings = (text) => text.replace(/^(###) \d+\.\d+ /gm, '$1 ');
const section = (title, body) => `## ${title}\n\n${body.trim()}`;
const sourceUrls = (text) => new Set(text.match(/https?:\/\/[^\s)]+/g) || []);

// This is an explicit migration of the existing Octo note, not a paper summarizer.
export function refactorOctoNote(note) {
  const nextHeadings = NOTE_SECTIONS.map((item) => item.title);
  const currentHeadings = [...note.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  if (JSON.stringify(currentHeadings) === JSON.stringify(nextHeadings))
    return { note, changed: false };
  assert.deepEqual(currentHeadings, originalHeadings, 'Unexpected Octo structure; review manually');
  const parts = note
    .split(/^## .+\n/gm)
    .slice(1)
    .map((part) => part.trim());
  const [overview, background, related, mechanism, design, results, discussion, resources] = parts;

  const metadata = overview.match(/^采用版本：.+$/m)?.[0];
  const sourceLinks = overview.match(/^\[本地完整 PDF\].+$/m)?.[0];
  const contribution = overview.match(/^单个组件已有先例；.+$/m)?.[0];
  const figure = overview.match(/!\[Octo 官方总览[\s\S]+$/)?.[0];
  assert(metadata && sourceLinks && contribution && figure, 'Expected source material missing');
  const relatedSplit = related.split('### 3.2 在当前知识库中的位置');
  assert.equal(relatedSplit.length, 2, 'Expected related-work boundary missing');
  const position = relatedSplit[1];
  const scientificPosition = position.match(/Octo 不应仅因接收语言输入[^\n]+/)?.[0];
  const distinction = position.match(/有限历史与持久记忆分开[^\n]+/)?.[0];
  const references = position.match(/^相关引用可从.+$/m)?.[0];
  assert(scientificPosition && distinction && references, 'Expected scientific context missing');

  const resourceIntroduction = [
    '### 材料范围与版本',
    '本次仅重组已保存笔记，未重新核验原文或运行实验。原笔记记录的材料包括 arXiv v2、官方项目页及固定提交的代码阅读；此前补充记录曾回看文件第 4、5、7、8、17 页。以下分析、来源与未决疑点沿用这些既有材料。',
    metadata,
    sourceLinks,
  ].join('\n\n');
  const next =
    [
      section(
        nextHeadings[0],
        [
          background,
          relatedSplit[0],
          scientificPosition,
          distinction,
          references,
          contribution,
          figure,
        ].join('\n\n'),
      ),
      section(nextHeadings[1], mechanism),
      section(nextHeadings[2], `${design}\n\n${results}`),
      section(nextHeadings[3], discussion),
      section(nextHeadings[4], `${resourceIntroduction}\n\n${resources}`),
    ]
      .map(cleanHeadings)
      .join('\n\n') + '\n';

  // All detailed scientific sections and the whole appendix remain intact.
  for (const body of [
    background,
    relatedSplit[0],
    mechanism,
    design,
    results,
    discussion,
    resources,
  ])
    assert(next.includes(cleanHeadings(body.trim())), 'Scientific text or appendix changed');
  for (const url of sourceUrls(note)) assert(sourceUrls(next).has(url), `Source link lost: ${url}`);
  assert(!next.includes('### 1.1 阅读路径'), 'Navigation tutorial remains');
  assert(!next.includes('### 1.2 关键贡献'), 'Duplicate overview table remains');
  assert.deepEqual(
    [...next.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
    nextHeadings,
  );
  return { note: next, changed: next !== note };
}

async function main() {
  const args = process.argv.slice(2);
  assert(
    args.every((arg) => ['--write', '--publish-consent'].includes(arg)),
    'Unknown argument',
  );
  const root = process.cwd();
  let store = await readWorkspace(root);
  let paper = store.dataset.papers.find((item) => item.id === 'octo');
  assert(paper, 'Octo record not found');
  let result = refactorOctoNote(paper.note || '');
  if (!result.changed) {
    console.log(JSON.stringify({ paperId: paper.id, changed: false }));
    return;
  }
  const write = args.includes('--write');
  const publishConsent = args.includes('--publish-consent');
  assert(
    !write || paper.visibility !== 'public' || publishConsent,
    'Public write requires --publish-consent',
  );
  let backup;
  if (write) {
    backup = await backupWorkspace(root);
    // Re-read after backup so concurrent changes are not replayed from an old record.
    store = await readWorkspace(root);
    paper = store.dataset.papers.find((item) => item.id === 'octo');
    result = refactorOctoNote(paper.note || '');
    if (!result.changed) {
      console.log(JSON.stringify({ paperId: paper.id, changed: false, backupId: backup.backupId }));
      return;
    }
  }
  await putRecord(root, {
    collection: 'papers',
    record: { ...paper, note: result.note },
    expectedRevision: store.revision,
    // Dry runs validate a potential public edit without publishing it.
    publishConsent: write ? publishConsent : true,
    write,
  });
  if (write) {
    const saved = await readWorkspace(root);
    const savedPaper = saved.dataset.papers.find((item) => item.id === paper.id);
    assert.equal(savedPaper.note, result.note, 'Note readback mismatch');
    const { note: beforeNote, ...beforeFields } = paper;
    const { note: afterNote, ...afterFields } = savedPaper;
    assert.deepEqual(afterFields, beforeFields, 'Unrelated paper fields changed');
    for (const [collection, items] of Object.entries(store.dataset)) {
      if (!Array.isArray(items)) continue;
      assert.deepEqual(
        saved.dataset[collection].filter((item) => collection !== 'papers' || item.id !== paper.id),
        items.filter((item) => collection !== 'papers' || item.id !== paper.id),
        `Unrelated ${collection} changed`,
      );
    }
  }
  console.log(
    JSON.stringify({
      paperId: paper.id,
      changed: true,
      dryRun: !write,
      beforeCharacters: paper.note.length,
      afterCharacters: result.note.length,
      sections: NOTE_SECTIONS.map((item) => item.title),
      backupId: backup?.backupId,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
