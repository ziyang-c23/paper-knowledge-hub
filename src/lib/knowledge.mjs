/** Browser-safe deterministic retrieval. No credentials, filesystem, or model calls. */
export function normalizePaper(p) {
  return {
    lifecycle: 'active',
    facets: {},
    status: 'unread',
    topics: [],
    tags: [],
    aliases: [],
    abstract: '',
    note: '',
    ...p,
  };
}

/**
 * Derive the small, user-facing reading path from existing records.
 * It deliberately does not add status fields to the paper schema: each step
 * is a deterministic view over the paper, attached documents, evidence and
 * topic comparison records.
 */
export function readingProgress(paper, { documents = [], evidence = [], topics = [] } = {}) {
  const paperEvidence = evidence.filter((item) => item.paperId === paper.id);
  const hasDocument = documents.some((item) => item.paperId === paper.id);
  const headings = String(paper.note || '').match(/^#{2,3}\s+.+$/gm) || [];
  const structuredNote = headings.length >= 6;
  const verifiedEvidence = paperEvidence.some((item) => item.status === 'verified');
  const inComparison = topics.some((topic) => (topic.compareIds || []).includes(paper.id));
  const steps = [
    { id: 'catalogued', label: '已收录', ready: Boolean(paper.id) },
    { id: 'source', label: '原文入口', ready: hasDocument || Boolean(paper.url) },
    { id: 'note', label: '结构化笔记', ready: structuredNote },
    { id: 'evidence', label: '有核验依据', ready: verifiedEvidence },
    { id: 'comparison', label: '进入比较', ready: inComparison },
  ];
  let current = 0;
  for (const [index, step] of steps.entries()) if (step.ready) current = index;
  return {
    steps,
    current,
    verifiedEvidence: paperEvidence.filter((e) => e.status === 'verified').length,
  };
}
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const tokens = (query) => normalizeText(query).split(' ').filter(Boolean);
const searchable = (p) =>
  [
    p.id,
    p.title,
    p.acronym,
    ...(p.authors || []),
    ...(p.aliases || []),
    ...(p.tags || []),
    p.abstract,
    p.note,
    p.problem,
    p.method,
    p.tasks,
    p.limitations,
  ]
    .filter(Boolean)
    .join('\n');
export function inScope(data, record) {
  return (
    !(record.kind && record.lifecycle === 'archived') &&
    (data.scope === 'local' || record.visibility === 'public')
  );
}
export function paperMatches(
  p,
  { paperId, topic, year, status, lifecycle, facets = {}, dimension, entity } = {},
) {
  return (
    (!paperId || p.id === paperId) &&
    (!topic || (p.topics || []).includes(topic)) &&
    (!year || String(p.year) === String(year)) &&
    (!status || p.status === status) &&
    (lifecycle === 'all' ||
      (lifecycle ? (p.lifecycle || 'active') === lifecycle : p.lifecycle !== 'archived')) &&
    (!dimension || !entity || (p.facets?.[dimension] || []).includes(entity)) &&
    Object.entries(facets).every(
      ([key, value]) =>
        !value ||
        (Array.isArray(value) ? value : [value]).every((id) =>
          (p.facets?.[key] || []).includes(id),
        ),
    )
  );
}
export function filterPapers(data, filters = {}) {
  const ts = tokens(filters.q);
  const evidence = data.evidence || [];
  const phrase = normalizeText(filters.q);
  const exactAlias = Boolean(
    phrase &&
    data.papers.some(
      (p) =>
        inScope(data, p) &&
        [p.id, p.title, p.acronym, ...(p.aliases || [])]
          .filter(Boolean)
          .some((a) => normalizeText(a) === phrase),
    ),
  );
  const queryMatches = (text) =>
    exactAlias
      ? normalizeText(text).includes(phrase)
      : ts.every((t) => normalizeText(text).includes(t));
  return data.papers
    .map(normalizePaper)
    .filter(
      (p) =>
        inScope(data, p) &&
        paperMatches(p, filters) &&
        queryMatches(
          searchable(p) +
            '\n' +
            evidence
              .filter((e) => e.paperId === p.id && inScope(data, e))
              .map((e) => e.text)
              .join('\n'),
        ),
    )
    .sort((a, b) =>
      filters.sort === 'title'
        ? a.title.localeCompare(b.title)
        : filters.sort === 'oldest'
          ? a.year - b.year || a.id.localeCompare(b.id)
          : filters.sort === 'updated'
            ? (b.updated || '').localeCompare(a.updated || '') ||
              b.year - a.year ||
              a.id.localeCompare(b.id)
            : b.year - a.year || a.id.localeCompare(b.id),
    );
}
function snippet(text, ts) {
  const norm = normalizeText(text);
  const at = Math.max(0, norm.indexOf(ts.find((t) => norm.includes(t)) || ''));
  const start = Math.max(0, at - 70);
  return `${start ? '…' : ''}${String(text).slice(start, start + 320)}${String(text).length > start + 320 ? '…' : ''}`;
}
export function graphNeighborhood(data, start, hops = 1, { type, nodeType } = {}) {
  const all = [
    ...data.papers
      .filter((p) => inScope(data, p) && paperMatches(p))
      .map((p) => ({ ...normalizePaper(p), nodeType: 'paper' })),
    ...data.topics.filter((p) => inScope(data, p)).map((p) => ({ ...p, nodeType: 'topic' })),
    ...data.concepts.filter((p) => inScope(data, p)).map((p) => ({ ...p, nodeType: p.kind })),
  ];
  const map = new Map(all.map((n) => [n.id, n]));
  const validEvidence = new Set(
    data.evidence
      .filter((e) => inScope(data, e) && e.status === 'verified' && map.has(e.paperId))
      .map((e) => e.id),
  );
  const candidates = data.relations.filter(
    (r) =>
      inScope(data, r) &&
      r.status === 'approved' &&
      !['model', 'similarity'].includes(r.origin) &&
      r.evidenceIds?.length &&
      r.evidenceIds.every((id) => validEvidence.has(id)) &&
      map.has(r.source) &&
      map.has(r.target) &&
      (!type || r.type === type),
  );
  const visited = new Set(Array.isArray(start) ? start : map.has(start) ? [start] : []);
  let frontier = new Set(visited);
  let selected = [];
  for (let i = 0; i < Math.min(2, Math.max(0, hops)); i++) {
    const next = new Set();
    for (const r of candidates)
      if (frontier.has(r.source) || frontier.has(r.target)) {
        selected.push(r);
        for (const id of [r.source, r.target])
          if (!visited.has(id)) {
            visited.add(id);
            next.add(id);
          }
      }
    frontier = next;
  }
  const nodes = all
    .filter((n) => visited.has(n.id) && (!nodeType || n.nodeType === nodeType))
    .sort((a, b) => a.id.localeCompare(b.id));
  const kept = new Set(nodes.map((n) => n.id));
  const edges = [...new Map(selected.map((r) => [r.id, r])).values()]
    .filter((r) => kept.has(r.source) && kept.has(r.target))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, edges };
}
export function retrieve(data, query, options = {}) {
  const ts = tokens(query);
  if (!ts.length) return { direct: [], expanded: [], evidence: [] };
  const matches = filterPapers(data, { ...options, q: query }),
    direct = [];
  for (const p of matches) {
    const ev = data.evidence.filter((e) => e.paperId === p.id && inScope(data, e));
    const ranked = ev
      .map((e) => ({
        e,
        score: ts.reduce((n, t) => n + Number(normalizeText(e.text).includes(t)), 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id));
    if (ranked.length)
      for (const { e, score } of ranked.slice(0, 3))
        direct.push({ paperId: p.id, text: snippet(e.text, ts), evidenceId: e.id, score });
    else direct.push({ paperId: p.id, text: snippet(searchable(p), ts), score: ts.length });
  }
  direct.sort((a, b) => b.score - a.score || a.paperId.localeCompare(b.paperId));
  const expanded = [],
    used = new Set(matches.map((p) => p.id));
  if (options.expand) {
    for (const p of matches) {
      const graph = graphNeighborhood(data, p.id, options.hops || 2, {
        type: options.relationType,
      });
      for (const n of graph.nodes) {
        if (n.nodeType !== 'paper' || used.has(n.id) || !paperMatches(n, options)) continue;
        used.add(n.id);
        const r = graph.edges.find((r) => r.source === n.id || r.target === n.id);
        const e = data.evidence.find(
          (e) => e.paperId === n.id && inScope(data, e) && e.status === 'verified',
        );
        expanded.push({
          paperId: n.id,
          text: e ? snippet(e.text, ts) : snippet(searchable(n), ts),
          ...(e ? { evidenceId: e.id } : {}),
          via: p.id,
          relationId: r.id,
        });
      }
    }
  }
  const ids = new Set([...direct, ...expanded].map((x) => x.evidenceId).filter(Boolean));
  return {
    direct,
    expanded,
    evidence: data.evidence.filter((e) => ids.has(e.id) && inScope(data, e)),
  };
}
const escapeCell = (v) =>
  String(v ?? '未知 / 未提供')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
export function comparisonMarkdown(
  papers,
  fields = ['problem', 'method', 'data', 'tasks', 'evaluation', 'limitations'],
) {
  const columns = fields.map((f) => (typeof f === 'string' ? { key: f, label: f } : f));
  const lines = [
    `| 维度 | ${papers.map((p) => escapeCell(p.title)).join(' | ')} |`,
    `| --- | ${papers.map(() => '---').join(' | ')} |`,
  ];
  for (const f of columns)
    lines.push(
      `| ${escapeCell(f.label)} | ${papers.map((p) => escapeCell(p[f.key] || '未知 / 未提供')).join(' | ')} |`,
    );
  lines.push(`| 来源 | ${papers.map((p) => `[论文](${p.url})`).join(' | ')} |`);
  return lines.join('\n') + '\n';
}
export function statistics(data) {
  const papers = data.papers.filter((p) => inScope(data, p) && paperMatches(p));
  const entityIds = new Set(
    [
      ...papers,
      ...data.topics.filter((x) => inScope(data, x)),
      ...data.concepts.filter((x) => inScope(data, x)),
    ].map((x) => x.id),
  );
  const counts = (values) =>
    Object.fromEntries(
      [...new Set(values)].sort().map((v) => [v, values.filter((x) => x === v).length]),
    );
  return {
    total: papers.length,
    papers: papers.length,
    topics: data.topics.filter((x) => inScope(data, x)).length,
    concepts: data.concepts.filter((x) => inScope(data, x)).length,
    relations: data.relations.filter(
      (x) =>
        inScope(data, x) &&
        x.status === 'approved' &&
        entityIds.has(x.source) &&
        entityIds.has(x.target),
    ).length,
    evidence: data.evidence.filter(
      (x) => inScope(data, x) && papers.some((p) => p.id === x.paperId),
    ).length,
    byYear: counts(papers.map((p) => String(p.year))),
    byTopic: counts(papers.flatMap((p) => p.topics || [])),
    byStatus: counts(papers.map((p) => p.status || 'unread')),
  };
}

export function awesomeMarkdown(papers) {
  const escape = (value) =>
    String(value)
      .replace(/\\/g, '\\\\')
      .replace(/([\[\]*_`])/g, '\\$1')
      .replace(/[\r\n]+/g, ' ');
  return (
    papers
      .map(
        (p) =>
          `- **[${escape(p.title)}](<${p.url.replace(/</g, '%3C').replace(/>/g, '%3E')}>)** (${p.year})${p.authors?.length ? ' — ' + p.authors.map(escape).join(', ') : ''}.`,
      )
      .join('\n') + '\n'
  );
}
