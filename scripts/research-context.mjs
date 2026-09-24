#!/usr/bin/env node
/**
 * Build read-only, source-bounded context for the research explanation skills.
 * This command never writes the canonical workspace and never fetches a URL.
 * Use ai:prepare/ai:task for the existing draft and apply workflow.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { readWorkspace } from '../services/workspace-store.mjs';
import { paperSources, aiContextRecord } from '../src/lib/sources.mjs';

const args = process.argv.slice(2);
const command = args[0];
const value = (flag) => {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args[i + 1];
};
const paperId = value('--paper');
const output = value('--out');

function usage() {
  throw new Error(
    'Usage: node scripts/research-context.mjs inspect|reader-context|explain-context --paper PAPER_ID [--out private/ai-drafts/FILE.json]',
  );
}
if (!['inspect', 'reader-context', 'explain-context'].includes(command) || !paperId) usage();

const root = process.cwd();
const store = await readWorkspace(root);
const paper = store.dataset.papers.find((item) => item.id === paperId);
if (!paper) throw new Error(`Unknown paper ID: ${paperId}`);
const contextPaper = aiContextRecord(paper);
const documents = [];
for (const id of store.documentIds || []) {
  try {
    const document = JSON.parse(
      await fs.readFile(path.join(root, 'private', 'documents', `${id}.json`), 'utf8'),
    );
    if (document.paperId !== paperId) continue;
    documents.push({
      id: document.id,
      filename: document.filename,
      pageCount: document.pageCount,
      sha256: document.sha256,
      quality: document.quality,
      pages:
        command === 'reader-context'
          ? document.pages.map(({ pageIndex, pageLabel, text, warnings }) => ({
              pageIndex,
              pageLabel,
              text,
              warnings: warnings || [],
            }))
          : undefined,
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const evidence = (store.dataset.evidence || [])
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
const sources = [
  ...(contextPaper.sources || []),
  ...(contextPaper.visuals?.resources || []).map((resource) => ({
    ...resource,
    readStatus: 'catalogued',
    supports: resource.kind === 'code' ? ['implementation'] : ['paper-context'],
    limitations:
      resource.kind === 'code'
        ? ['A resource link does not prove the paper experiment used the current branch.']
        : [],
  })),
];
const context = {
  workflow: command,
  generatedAt: new Date().toISOString(),
  baseRevision: store.revision,
  paper: {
    id: paper.id,
    title: paper.title,
    url: paper.url,
    version: paper.version,
    note: command === 'inspect' ? undefined : paper.note,
    visuals: command === 'explain-context' ? contextPaper.visuals : undefined,
  },
  sources,
  sourceScope: {
    indexedSources: paperSources(paper).length,
    eligibleSources: paperSources(paper).filter((source) => source.aiAllowed === true).length,
    externalSendingAuthorized: false,
    note: 'Saved source excerpts only; no live discovery or whole-repository indexing occurred.',
  },
  documents,
  evidence,
  boundaries: [
    'This is a local, read-only context export. It does not claim that every linked source was read.',
    'A paper source, official project claim, static code observation and runtime result must remain separate.',
    'Unknown values remain unknown; do not infer trial counts, implementation revisions or video outcomes.',
  ],
};
if (command === 'inspect') {
  console.log(
    JSON.stringify(
      {
        paperId,
        baseRevision: store.revision,
        sourceCount: sources.length,
        documentCount: documents.length,
        evidenceCount: evidence.length,
        sourceTypes: sources.map(({ type, kind }) => type || kind),
        documentPages: documents.map(({ id, pageCount, sha256 }) => ({ id, pageCount, sha256 })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const target = path.resolve(root, output || `private/ai-drafts/${paperId}-${command}.json`);
const privateRoot = path.resolve(root, 'private') + path.sep;
if (!target.startsWith(privateRoot)) throw new Error('Context output must stay under private/');
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.writeFile(target, `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
console.log(
  JSON.stringify(
    { output: path.relative(root, target), paperId, baseRevision: store.revision },
    null,
    2,
  ),
);
