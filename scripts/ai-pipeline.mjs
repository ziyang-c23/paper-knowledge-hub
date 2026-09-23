import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readWorkspace, safePrivate } from '../services/workspace-store.mjs';

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const paperId = value('--paper');
const output = value('--out') || (paperId ? `private/ai-drafts/${paperId}-context.json` : '');

if (!paperId || !output) {
  console.error(
    'Usage: npm run ai:prepare -- --paper PAPER_ID [--out private/ai-drafts/PAPER-context.json]',
  );
  process.exit(1);
}

const root = process.cwd();
const store = await readWorkspace(root);
const paper = store.dataset.papers.find((item) => item.id === paperId);
if (!paper) throw Error(`Unknown paper ID: ${paperId}`);
const documentIds = new Set(store.documentIds || []);
const documents = [];
for (const id of documentIds) {
  const metaPath = path.join(root, 'private', 'documents', id + '.json');
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    if (meta.paperId === paperId) {
      documents.push({
        id: meta.id,
        filename: meta.filename,
        pageCount: meta.pageCount,
        sha256: meta.sha256,
        pages: meta.pages.map((page) => ({
          pageIndex: page.pageIndex,
          pageLabel: page.pageLabel,
          text: page.text,
          warnings: page.warnings || [],
        })),
      });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const evidence = store.dataset.evidence
  .filter((item) => item.paperId === paperId)
  .map(({ id, kind, status, text, url, locator, documentId, pageIndex, pageLabel, quote }) => ({
    id,
    kind,
    status,
    text,
    url,
    locator,
    documentId,
    pageIndex,
    pageLabel,
    quote,
  }));
const related = store.dataset.relations
  .filter((item) => item.source === paperId || item.target === paperId)
  .map(({ id, source, target, type, evidenceIds, origin, status }) => ({
    id,
    source,
    target,
    type,
    evidenceIds,
    origin,
    status,
  }));
const context = {
  workflowVersion: 'paper-note-v2',
  generatedAt: new Date().toISOString(),
  baseRevision: store.revision,
  collection: 'papers',
  paper: {
    ...paper,
    personalAnalysis: undefined,
  },
  sourceBoundary: {
    sourceMaterial: [
      paper.url,
      ...documents.map((document) => `private/documents/${document.id}.json`),
    ],
    documents: documents.map(({ id, filename, pageCount, sha256 }) => ({
      id,
      filename,
      pageCount,
      sha256,
    })),
    evidenceCount: evidence.length,
    verifiedEvidenceCount: evidence.filter((item) => item.status === 'verified').length,
  },
  requiredSections: [
    '论文概览',
    '研究背景与问题定义',
    '相关工作',
    '方法',
    '实验设计',
    '实验结果与分析',
    '局限性与讨论',
    '附录',
  ],
  extractionRules: [
    '只使用 source/verified 证据支持事实；note 是整理者归纳，model/unverified 不得升级为原文结论。',
    '每个关键数值保留实验条件、试验数、版本和 PDF 文件页序；未知信息明确写未知。',
    '论文主张、项目页主张、固定提交代码观察和实际运行结果分开标注。',
    '保留冲突和歧义，不用推断补齐试验次数、相机设置或实现版本。',
    '正文按输入、表示、变换、输出和学习信号解释方法；附录放资源、复核条件、代码对应和完整原文。',
  ],
  prompt: `请基于本上下文整理或更新 ${paper.title} 的论文记录。输出 {"collection":"papers","record":{...},"sourceMaterial":[],"uncertainties":[]}，record.note 必须使用八个固定 H2 章节：${[...new Set(['论文概览', '研究背景与问题定义', '相关工作', '方法', '实验设计', '实验结果与分析', '局限性与讨论', '附录'])].join('、')}。不要输出 personalAnalysis；如有研究建议，放入 uncertainties 或另建私有字段。每个重要字段都要在 claimEvidence 中引用本论文的 evidence ID。完成后用 npm run ai:draft -- FILE --collection papers --stage 进入草稿箱。`,
  evidence,
  relations: related,
  documents,
};
const target = path.resolve(root, output);
const privateDir = await safePrivate(root);
if (!target.startsWith(privateDir + path.sep)) throw Error('AI context must stay under private/');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(context, null, 2) + '\n', { flag: 'w', mode: 0o600 });
console.log(
  JSON.stringify({
    output,
    paperId,
    documents: documents.length,
    evidence: evidence.length,
    baseRevision: store.revision,
  }),
);
