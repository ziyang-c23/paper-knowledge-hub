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
};
export function entityConnections(dataset, entityId) {
  const all = [...dataset.papers, ...dataset.topics, ...dataset.concepts];
  const entity = dataset.concepts.find((e) => e.id === entityId);
  if (!entity) return { outgoing: [], incoming: [], papers: [], relations: [] };
  const outgoing = (entity.relatedIds || [])
    .map((id) => all.find((e) => e.id === id))
    .filter(Boolean);
  const incoming = dataset.concepts.filter(
    (e) => e.id !== entityId && (e.relatedIds || []).includes(entityId),
  );
  const paperIds = new Set([
    ...outgoing.filter((e) => dataset.papers.some((p) => p.id === e.id)).map((p) => p.id),
    ...dataset.papers
      .filter((p) =>
        Object.values(p.facets || {})
          .flat()
          .includes(entityId),
      )
      .map((p) => p.id),
  ]);
  const relations = dataset.relations.filter((r) => r.source === entityId || r.target === entityId);
  for (const r of relations) {
    if (r.status !== 'approved' || !['source', 'curator'].includes(r.origin)) continue;
    const other = r.source === entityId ? r.target : r.source;
    if (dataset.papers.some((p) => p.id === other)) paperIds.add(other);
  }
  return {
    outgoing,
    incoming,
    papers: dataset.papers.filter((p) => paperIds.has(p.id) && p.lifecycle !== 'archived'),
    relations,
  };
}
export function entityExport(entity, dataset) {
  const all = [...dataset.papers, ...dataset.topics, ...dataset.concepts];
  return `# ${entity.title}\n\n类型：${entityKinds[entity.kind] || entity.kind}\n稳定 ID：${entity.id}\n本地导出；含私有整理内容，分享前请审核。\n\n${entity.description || ''}\n\n${entity.url ? '主页：' + entity.url + '\n\n' : ''}${entity.note || ''}\n\n## 资料来源\n\n${(entity.sources || []).map((s) => `- ${s.title}: ${s.url}${s.note ? '\n  ' + s.note : ''}`).join('\n') || '尚未记录来源；链接存在不等于已经核验。'}\n\n## 手工关联\n\n${(entity.relatedIds || []).map((id) => '- ' + (all.find((e) => e.id === id)?.title || id) + ' (`' + id + '`)').join('\n') || '暂无'}\n\n手工关联用于组织资料，不自动表示任职、采用或继承关系。\n`;
}
