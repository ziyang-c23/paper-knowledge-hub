/** Explicit, local-only evidence-backed example enrichment. Never overwrites edited records. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadData, validateData } from './data.mjs';
import {
  readWorkspace,
  withWorkspaceLock,
  requireRevision,
  commitWorkspace,
  backupWorkspace,
} from '../services/workspace-store.mjs';
import { listDocuments } from '../services/pdf.mjs';
const args = process.argv.slice(2),
  root = path.resolve(
    args.includes('--root')
      ? args[args.indexOf('--root') + 1]
      : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const specs = {
  openvla: {
    id: 'doc-6146d22b2deb83a754c130762f354c28',
    sha256: '353c37df34458f12f969b14dfd8b77175b727b9cddea7bb891759beddeefe1be',
  },
  octo: {
    id: 'doc-1a657306ca866f04d56514d46a5cdcc1',
    sha256: '73bff297cfafe523319162124e6b7f96919c0930e0a380f307255c4c7464ac93',
  },
};
try {
  const store = await readWorkspace(root),
    seed = await loadData(root),
    manifest = JSON.parse(
      await fs.readFile(path.join(root, 'content', 'demo-manifest.json'), 'utf8'),
    );
  const docs = await listDocuments(root);
  for (const [paperId, spec] of Object.entries(specs)) {
    const doc = docs.find(
      (x) => x.id === spec.id && x.paperId === paperId && x.sha256 === spec.sha256,
    );
    if (!doc)
      throw Error(`Required exact PDF missing: ${paperId}. See docs/fulltext-verification.md.`);
    const bytes = await fs.readFile(path.join(root, 'private', 'documents', spec.id + '.pdf'));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== spec.sha256)
      throw Error(`PDF hash mismatch: ${paperId}`);
  }
  const dataset = structuredClone(store.dataset),
    changes = [],
    conflicts = [];
  // Exact prior outputs from the first source review; accepted only as whole-record
  // matches, so this correction cannot overwrite subsequent personal edits.
  const reviewedPriorFields = {
    openvla: {
      claimEvidence: {
        method: ['ev-openvla-method'],
        data: ['ev-openvla-method', 'ev-openvla-mixture-p21'],
        evaluation: ['ev-openvla-mixture-p21'],
        limitations: ['ev-openvla-limits'],
        deployment: ['ev-openvla-efficiency-p10'],
        memory: ['ev-openvla-limits'],
      },
    },
    octo: {
      claimEvidence: {
        method: ['ev-octo-method'],
        data: ['ev-octo-summary'],
        evaluation: ['ev-octo-summary'],
        limitations: ['ev-octo-history-p15', 'ev-octo-gripper-p15'],
      },
    },
    'rt-2': { claimEvidence: { method: ['ev-rt-2-method'], data: ['ev-rt-2-summary'] } },
    'topic-vla': {
      branches: ['动作 token 路线：RT-2 → OpenVLA', '通用策略适配：Octo', '感知与语言基础：PaLM-E'],
    },
  };
  async function patch(kind, id, addition) {
    const original = seed[kind].find((x) => x.id === id);
    if (!original) throw Error(`Missing canonical example ${id}`);
    const rel = `content/${kind}/${id}.json`,
      bytes = await fs.readFile(path.join(root, rel));
    if (
      !original.demo ||
      manifest.files?.[rel] !== crypto.createHash('sha256').update(bytes).digest('hex')
    )
      throw Error(`Modified/unregistered seed source: ${rel}`);
    const base = {
        ...original,
        visibility: 'private',
        ...(kind === 'papers' ? { lifecycle: 'active' } : {}),
      },
      next = { ...base, ...addition },
      index = dataset[kind].findIndex((x) => x.id === id),
      current = dataset[kind][index];
    if (equal(current, next)) return;
    if (
      index < 0 ||
      (!equal(current, base) &&
        !(reviewedPriorFields[id] && equal(current, { ...next, ...reviewedPriorFields[id] })))
    ) {
      conflicts.push(`${kind}/${id}: edited, missing, or public record; no overwrite`);
      return;
    }
    dataset[kind][index] = next;
    changes.push(`${kind}/${id}`);
  }
  function add(kind, record) {
    const next = { schemaVersion: 1, visibility: 'private', demo: true, ...record },
      current = dataset[kind].find((x) => x.id === next.id);
    if (current) {
      if (!equal(current, next))
        conflicts.push(`${kind}/${next.id}: existing nonidentical record; no overwrite`);
      return;
    }
    dataset[kind].push(next);
    changes.push(`${kind}/${next.id}`);
  }
  const dimensions = {
    'concept-grounding': ['problem', ['grounding', '具身对齐']],
    'concept-vla': ['architecture', ['VLA', '视觉语言动作模型', 'Vision Language Action']],
    'dataset-open-x': ['dataset', ['OXE', 'Open-X', 'Open X Embodiment']],
    'method-action-tokens': [
      'architecture',
      ['action tokens', '动作离散化', 'discrete action tokens'],
    ],
    'method-affordance': ['deployment', ['affordance', '可执行性约束']],
    'method-diffusion': ['architecture', ['diffusion', '扩散动作头', 'diffusion policy']],
    'method-imagination': ['learning', ['imagined actor critic', '想象训练']],
    'method-rssm': ['architecture', ['RSSM', 'Recurrent State Space Model']],
    'method-segment-memory': ['memory', ['segment recurrence', '片段递归']],
    'method-skill-library': ['memory', ['skill library', '技能库']],
  };
  for (const [id, [dimension, aliases]] of Object.entries(dimensions))
    await patch('concepts', id, { dimension, aliases });
  const concepts = [
    [
      'method-target-finetuning',
      '目标设置微调',
      'learning',
      'method',
      ['target setting finetuning', '新机器人适配'],
      '对目标机器人/任务数据微调；不代表部署过程中在线更新。',
    ],
    [
      'method-observation-history',
      '有限观测历史',
      'memory',
      'method',
      ['observation history', '历史观测'],
      '把过去观测作为策略输入；不同于持续记忆或参数更新。',
    ],
    [
      'method-inference-quantization',
      '推理量化',
      'deployment',
      'method',
      ['quantization', '量化推理'],
      '降低推理数值精度；不等于在线学习或持续更新模型参数。',
    ],
    [
      'task-robot-manipulation',
      '机器人操作',
      'task',
      'concept',
      ['robot manipulation', '操作任务'],
      '本例包含物体抓取/移动等操作；不说明所有任务设置一致。',
    ],
    [
      'environment-widowx',
      'WidowX BridgeData 评测',
      'environment',
      'concept',
      ['WidowX', 'BridgeData V2'],
      '使用 WidowX 的论文评测；具体任务集合、试验数与数据划分仍需分别核对。',
    ],
  ];
  for (const [id, title, dimension, kind, aliases, description] of concepts)
    add('concepts', { id, title, dimension, kind, aliases, description });
  const evidence = [
    {
      id: 'ev-openvla-efficiency-p10',
      paperId: 'openvla',
      kind: 'source',
      status: 'verified',
      text: '原文 file page 10 §5.3/§5.4：比较 LoRA 等目标设置微调方法与推理量化。Table 1 的微调任务、Table 2 的 BridgeData V2 评测不同；脚注 4 限定为较小数据混合与仅 SigLIP 视觉骨干的变体。不能把该表的显存/成功率直接泛化到所有 OpenVLA 模型，更不能据此断言部署时在线学习。',
      pageIndex: 10,
      documentId: specs.openvla.id,
      quote:
        'In Section 5.3 and Section 5.4, we experiment with a version of the OpenVLA model that is pretrained with a smaller robot data mixture',
      url: 'https://arxiv.org/pdf/2406.09246v3',
      locator: 'PDF file page 10, §5.3, §5.4, Tables 1–2, footnote 4',
    },
    {
      id: 'ev-openvla-mixture-p21',
      paperId: 'openvla',
      kind: 'source',
      status: 'verified',
      text: '原文 file page 21 Appendix A Table 3 列出 OpenVLA 数据混合；脚注 6 明确 DROID 在最后三分之一训练被移除并重新分配混合权重。Appendix B.1.1 描述 WidowX 的 17 个任务与每任务 10 次试验；这些设置不能与其他论文的单一总分混为一个指标。',
      pageIndex: 21,
      documentId: specs.openvla.id,
      quote: 'We remove DROID for the last third of training due to slow learning progress',
      url: 'https://arxiv.org/pdf/2406.09246v3',
      locator: 'PDF file page 21, Appendix A Table 3 and footnote 6; Appendix B.1.1',
    },
    {
      id: 'ev-octo-history-p15',
      paperId: 'octo',
      kind: 'source',
      status: 'verified',
      text: 'Octo file page 15 Appendix E：一帧历史在所评估的零样本任务中有益，进一步增加历史未见收益，但作者保留其他任务可能受益的可能性；action chunking 有益，temporal ensembling 在该评测中未在 receding horizon control 之上提供收益。这不是持续记忆或部署参数更新的证据。',
      pageIndex: 15,
      documentId: specs.octo.id,
      quote:
        'We did not observe benefits of increasing the history length further on the few tasks we evaluated on, though other tasks may benefit.',
      url: 'https://arxiv.org/pdf/2405.12213v2',
      locator: 'PDF file page 15, Appendix E Things that worked and did not work',
    },
    {
      id: 'ev-octo-gripper-p15',
      paperId: 'octo',
      kind: 'source',
      status: 'verified',
      text: 'Octo file page 15 Appendix E：相对 gripper 表示虽带来稍高抓取成功率，却减少失败后的重试，整体表现更差，最终选择绝对表示。该取舍依赖本文设置，不能归纳为所有机器人动作表示的统一结论。',
      pageIndex: 15,
      documentId: specs.octo.id,
      quote:
        'the relative representation led to less retrying behavior after a grasp failed, which was ultimately worse.',
      url: 'https://arxiv.org/pdf/2405.12213v2',
      locator: 'PDF file page 15, Appendix E Relative Gripper Action Representation',
    },
  ];
  for (const ev of evidence) add('evidence', { ...ev, pageLabel: `File page ${ev.pageIndex}` });
  await patch('evidence', 'ev-octo-method', {
    documentId: specs.octo.id,
    pageIndex: 4,
    pageLabel: 'File page 4',
    quote:
      'A lightweight “action head” that implements the diffusion process is applied to the embeddings for the readout tokens.',
  });
  await patch('papers', 'openvla', {
    facets: {
      architecture: ['concept-vla', 'method-action-tokens'],
      learning: ['method-target-finetuning'],
      deployment: ['method-inference-quantization'],
      task: ['task-robot-manipulation'],
      dataset: ['dataset-open-x'],
      environment: ['environment-widowx'],
    },
    claimEvidence: {
      method: ['ev-openvla-method'],
      data: ['ev-openvla-method'],
      limitations: ['ev-openvla-limits'],
      deployment: ['ev-openvla-efficiency-p10'],
      memory: ['ev-openvla-limits'],
    },
  });
  await patch('papers', 'octo', {
    facets: {
      architecture: ['method-diffusion'],
      learning: ['method-target-finetuning'],
      memory: ['method-observation-history'],
      task: ['task-robot-manipulation'],
      dataset: ['dataset-open-x'],
      environment: ['environment-widowx'],
    },
    claimEvidence: {
      method: ['ev-octo-method'],
      data: ['ev-octo-summary'],
    },
  });
  await patch('papers', 'rt-2', {
    facets: {
      architecture: ['concept-vla', 'method-action-tokens'],
      problem: ['concept-grounding'],
    },
    claimEvidence: { method: ['ev-rt-2-method'] },
  });
  const extras = [
    ['openvla', 'method-target-finetuning', 'ev-openvla-efficiency-p10'],
    ['openvla', 'method-inference-quantization', 'ev-openvla-efficiency-p10'],
    ['octo', 'method-observation-history', 'ev-octo-history-p15'],
    ['octo', 'method-target-finetuning', 'ev-octo-method'],
  ];
  for (const [source, target, evidenceId] of extras)
    add('relations', {
      id: `rel-local-${source}-${target}`,
      source,
      target,
      type: 'uses',
      evidenceIds: [evidenceId],
      origin: 'source',
      status: 'approved',
    });
  await patch('topics', 'topic-vla', {
    branches: [
      '动作 token 路线：RT-2 / OpenVLA（同类表示，不表示继承）',
      '通用策略适配：Octo',
      '感知与语言基础：PaLM-E',
    ],
    analysis:
      '## 整理者阶段性理解（公开论文的本地示例，不代表用户研究结论）\n\n本专题问：通用机器人策略如何把视觉/语言信息转成动作，并在新设置适配？范围是 RT-2、原始 OpenVLA v3 与 Octo v2；PaLM-E 仅提供背景，不当作同一控制策略横向排名。\n\n**机制分支。** RT-2 和 OpenVLA 把动作离散成 token；Octo 以模块化 token/readout 连接扩散动作头（ev-rt-2-method、ev-openvla-method、ev-octo-method，Octo 原文 file page 4）。这能组织架构选择，但不能从表示方式直接推导谁一定更强。\n\n**比较条件。** OpenVLA 和 Octo 都使用 Open X-Embodiment，但数据混合、规模、任务集合、适配数据和指标不一致。OpenVLA file page 10 的 LoRA/量化实验还使用更小的数据混合与 SigLIP-only 变体（脚注 4）。共享数据集不等于成功率可直接比较；先检查任务、评估次数、是否微调与模型版本。\n\n**历史与行为。** Octo Appendix E 的有限历史与 action chunking 结果说明输入历史和控制执行方式会影响表现；它们不能自动被称为长期记忆。gripper 表示的“抓取率略高但重试更少、总体更差”提醒我们区分局部指标与任务行为（ev-octo-history-p15、ev-octo-gripper-p15）。\n\n**部署时更新参数：当前未知。** 本例证据明确区分目标设置微调、推理量化与历史输入，但没有逐一审计部署控制循环或代码版本。不能由“支持微调”推出“部署时在线更新”，也不把未记录写成确定不更新。\n\n下一步应选择一个相同机器人、相同数据和任务的受控比较，再记录成功率、时延、失败恢复及数据预算。该建议是整理者推断，尚未运行实验。',
    gaps: [
      '本库尚未为三篇工作建立统一任务/数据预算/成功率定义的可比较实验表，不等于领域没有此类研究。',
      '部署时在线参数更新缺少对指定代码版本和运行循环的核验，保持未知。',
      'PDF 表格和公式只有原页定位与局部视觉核对，自动结构化提取未验证。',
      '有限观测历史、持续记忆与模型参数适应需要分别定义；本例不把三者混为同一种能力。',
    ],
    evidenceIds: [
      'ev-rt-2-method',
      'ev-openvla-method',
      'ev-octo-method',
      'ev-openvla-efficiency-p10',
      'ev-openvla-mixture-p21',
      'ev-octo-history-p15',
      'ev-octo-gripper-p15',
    ],
    compareIds: ['rt-2', 'openvla', 'octo'],
  });
  if (conflicts.length) throw Error('No changes written.\n' + conflicts.join('\n'));
  const errors = validateData(dataset);
  if (errors.length) throw Error(errors.join('\n'));
  const documentIds = [
    ...new Set([...(store.documentIds || []), ...Object.values(specs).map((x) => x.id)]),
  ];
  const indexChanged = !equal(documentIds, store.documentIds || []),
    report = {
      mode: args.includes('--write') ? 'write' : 'dry-run',
      changes,
      attachDocuments: documentIds.filter((id) => !(store.documentIds || []).includes(id)),
      publicSelections: 0,
    };
  if (args.includes('--write') && (changes.length || indexChanged)) {
    const backup = await backupWorkspace(root);
    const next = await withWorkspaceLock(root, async () => {
      const current = await readWorkspace(root);
      requireRevision(current, store.revision);
      return commitWorkspace(root, { ...current, dataset, documentIds });
    });
    report.backup = backup.backupId;
    report.revision = next.revision;
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
