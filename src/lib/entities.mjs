export const entityKinds = {
  person: '学者',
  institution: '机构 / 团队',
  project: '研究项目',
  problem: '研究问题',
  concept: '概念',
  method: '方法',
  model: '模型',
  dataset: '数据集',
  environment: '环境',
  benchmark: '评测基准',
  task: '任务',
};
export const entityDimensions = {
  person: [],
  institution: [],
  project: [],
  method: ['architecture', 'learning', 'memory', 'deployment'],
  model: ['architecture', 'learning', 'memory', 'deployment'],
  dataset: ['task', 'dataset', 'environment'],
  environment: ['task', 'dataset', 'environment'],
  benchmark: ['task', 'dataset', 'environment'],
  task: ['task'],
  problem: ['problem'],
  // Legacy concepts may already carry any of the eight facet dimensions.
  concept: [
    'problem',
    'architecture',
    'learning',
    'memory',
    'deployment',
    'task',
    'dataset',
    'environment',
  ],
};
export const entityGroups = [
  {
    id: 'people',
    label: '人物与团队',
    description: '作者、机构、团队与项目身份档案。',
    kinds: ['person', 'institution', 'project'],
  },
  {
    id: 'methods',
    label: '方法与模型',
    description: '可复用机制、模型结构与适用条件。',
    kinds: ['method', 'model'],
  },
  {
    id: 'data',
    label: '数据与评测',
    description: '数据集、环境与基准，连接到任务和评测范围。',
    kinds: ['dataset', 'environment', 'benchmark'],
  },
  {
    id: 'concepts',
    label: '研究概念',
    description: '用于理解和分类论文的术语与概念；不是待解决的问题。',
    kinds: ['concept'],
  },
  {
    id: 'tasks',
    label: '任务',
    description: '研究任务及其目标与使用范围。',
    kinds: ['task'],
  },
  {
    id: 'questions',
    label: '研究问题',
    description: '以明确问题句记录、连接论文并持续追踪的研究问题。',
    kinds: ['problem'],
  },
];

// Legacy stores used generic concepts for task and environment indexes.
// Derive their display type until an explicit, revision-checked migration runs.
export function effectiveEntityKind(entity) {
  if (entity?.kind === 'concept' && ['task', 'environment'].includes(entity.dimension))
    return entity.dimension;
  return entity?.kind;
}
export function entityGroupFor(entity) {
  return entityGroups.find((group) => group.kinds.includes(effectiveEntityKind(entity)));
}
export function entityConnections(dataset, entityId) {
  const all = [...dataset.papers, ...dataset.topics, ...dataset.concepts];
  const entity = dataset.concepts.find((e) => e.id === entityId);
  if (!entity)
    return {
      outgoing: [],
      incoming: [],
      papers: [],
      manualRelations: [],
      manualPapers: [],
      taxonomyPapers: [],
      evidencePapers: [],
      relations: [],
      verifiedRelations: [],
    };
  const outgoing = (entity.relatedIds || [])
    .map((id) => all.find((e) => e.id === id))
    .filter(Boolean);
  const incoming = dataset.concepts.filter(
    (e) => e.id !== entityId && (e.relatedIds || []).includes(entityId),
  );
  const taxonomyPaperIds = new Set(
    dataset.papers
      .filter((p) =>
        Object.values(p.facets || {})
          .flat()
          .includes(entityId),
      )
      .map((p) => p.id),
  );
  const manualPaperIds = new Set(
    outgoing.filter((e) => dataset.papers.some((p) => p.id === e.id)).map((p) => p.id),
  );
  const evidencePaperIds = new Set();
  const paperIds = new Set([...taxonomyPaperIds, ...manualPaperIds]);
  const relations = dataset.relations.filter((r) => r.source === entityId || r.target === entityId);
  const evidenceById = new Map((dataset.evidence || []).map((item) => [item.id, item]));
  const verifiedRelations = relations.filter(
    (r) =>
      r.status === 'approved' &&
      ['source', 'curator'].includes(r.origin) &&
      Array.isArray(r.evidenceIds) &&
      r.evidenceIds.length > 0 &&
      r.evidenceIds.every((id) => {
        const item = evidenceById.get(id);
        return item?.status === 'verified' && ['source', 'note'].includes(item.kind);
      }),
  );
  for (const r of verifiedRelations) {
    const other = r.source === entityId ? r.target : r.source;
    if (dataset.papers.some((p) => p.id === other)) {
      paperIds.add(other);
      evidencePaperIds.add(other);
    }
  }
  return {
    outgoing,
    incoming,
    papers: dataset.papers.filter((p) => paperIds.has(p.id) && p.lifecycle !== 'archived'),
    manualRelations: outgoing,
    manualPapers: dataset.papers.filter(
      (p) => manualPaperIds.has(p.id) && p.lifecycle !== 'archived',
    ),
    taxonomyPapers: dataset.papers.filter(
      (p) => taxonomyPaperIds.has(p.id) && p.lifecycle !== 'archived',
    ),
    evidencePapers: dataset.papers.filter(
      (p) => evidencePaperIds.has(p.id) && p.lifecycle !== 'archived',
    ),
    relations,
    verifiedRelations,
  };
}
export function entityExport(entity, dataset) {
  const all = [...dataset.papers, ...dataset.topics, ...dataset.concepts];
  const kind = effectiveEntityKind(entity);
  return `# ${entity.title}\n\n类型：${entityKinds[kind] || kind}\n稳定 ID：${entity.id}\n本地导出；含私有整理内容，分享前请审核。\n\n${entity.description || ''}\n\n${entity.url ? '主页：' + entity.url + '\n\n' : ''}${entity.note || ''}\n\n## 资料来源\n\n${(entity.sources || []).map((s) => `- ${s.title}: ${s.url}${s.note ? '\n  ' + s.note : ''}`).join('\n') || '尚未记录来源；链接存在不等于已经核验。'}\n\n## 手工关联\n\n${(entity.relatedIds || []).map((id) => '- ' + (all.find((e) => e.id === id)?.title || id) + ' (`' + id + '`)').join('\n') || '暂无'}\n\n手工关联用于组织资料，不自动表示任职、采用或继承关系。\n`;
}
