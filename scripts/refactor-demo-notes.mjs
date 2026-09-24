import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { backupWorkspace, putRecord, readWorkspace } from '../services/workspace-store.mjs';

const IDS = [
  'dreamerv3',
  'openvla',
  'palm-e',
  'rt-1',
  'rt-2',
  'saycan',
  'transformer-xl',
  'voyager',
];
const LONG_IDS = new Set(['dreamerv3', 'openvla', 'rt-2']);

function evidenceLink(paperId, id, evidence) {
  const item = evidence.find((entry) => entry.id === id && entry.paperId === paperId);
  return item ? `[查看来源](#/paper/${paperId}?evidence=${id})` : id;
}

function replaceEvidenceIds(text, paperId, evidence) {
  const links = [];
  const masked = text.replace(/\[查看来源\]\([^\n)]+\)/g, (link) => {
    links.push(link);
    return `@@SOURCE_LINK_${links.length - 1}@@`;
  });
  const replaced = masked.replace(/\bev-[a-z0-9-]+\b/g, (id) => {
    const item = evidence.find((entry) => entry.id === id && entry.paperId === paperId);
    return item ? evidenceLink(paperId, id, evidence) : id;
  });
  return replaced.replace(/@@SOURCE_LINK_(\d+)@@/g, (_, index) => links[Number(index)]);
}

export function refactorDemoNote(paper, evidence) {
  let note = String(paper.note || '');
  if (LONG_IDS.has(paper.id)) {
    note = note.replace(/^## 论文概览\n\n/, '## 阅读范围与结论边界\n\n');
    note = note.replace(/^公开演示笔记，依据 /m, '本条阅读范围依据 ');
    note = note.replace(/^这是一份公开演示笔记，依据 /m, '本条阅读范围依据 ');
    note = note.replace(/^公开演示笔记，/m, '本条阅读范围：');
    note = note.replace(/；未复现实验。/, '；未复现实验。');
  } else {
    note = note.replace(/^公开演示条目。/m, '');
    note = note.replace(/\n\n阅读状态是模板演示状态，不代表用户真实阅读进度。\n?$/, '\n');
  }
  note = replaceEvidenceIds(note, paper.id, evidence);
  note = note.replace(/证据 ID：/g, '来源：');
  note = note.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  assert(!note.includes('公开演示条目。'), `${paper.id}: stale demo label remains`);
  assert(!note.includes('公开演示笔记，'), `${paper.id}: stale demo label remains`);
  assert(!note.includes('阅读状态是模板演示状态'), `${paper.id}: stale status label remains`);
  for (const item of evidence.filter((entry) => entry.paperId === paper.id)) {
    if (note.includes(item.id))
      assert(note.includes(`evidence=${item.id}`), `${paper.id}: bare ${item.id}`);
  }
  return { note, changed: note !== paper.note };
}

async function main() {
  const args = process.argv.slice(2);
  assert(
    args.every((arg) => arg === '--write'),
    'Only --write is supported',
  );
  const root = process.cwd();
  let store = await readWorkspace(root);
  const evidence = store.dataset.evidence;
  const plan = IDS.map((id) => {
    const paper = store.dataset.papers.find((item) => item.id === id);
    assert(paper, `Paper not found: ${id}`);
    return { paper, ...refactorDemoNote(paper, evidence) };
  });
  console.log(
    JSON.stringify({
      dryRun: !args.includes('--write'),
      changes: plan
        .filter((item) => item.changed)
        .map((item) => ({
          id: item.paper.id,
          before: item.paper.note.length,
          after: item.note.length,
        })),
    }),
  );
  if (!args.includes('--write')) return;
  const backup = await backupWorkspace(root);
  for (const item of plan.filter((entry) => entry.changed)) {
    store = await readWorkspace(root);
    const current = store.dataset.papers.find((paper) => paper.id === item.paper.id);
    const next = refactorDemoNote(current, store.dataset.evidence);
    if (!next.changed) continue;
    await putRecord(root, {
      collection: 'papers',
      record: { ...current, note: next.note },
      expectedRevision: store.revision,
      write: true,
    });
  }
  store = await readWorkspace(root);
  for (const id of IDS) {
    const paper = store.dataset.papers.find((item) => item.id === id);
    const check = refactorDemoNote(paper, store.dataset.evidence);
    assert(!check.changed, `${id}: readback is not idempotent`);
  }
  console.log(
    JSON.stringify({
      written: plan.filter((item) => item.changed).map((item) => item.paper.id),
      backupId: backup.backupId,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
