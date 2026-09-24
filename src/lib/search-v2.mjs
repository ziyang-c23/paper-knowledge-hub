/** Deterministic lexical search; no embeddings, LLM, or hidden network requests. */
import { normalizeText, inScope, paperMatches, graphNeighborhood } from './knowledge.mjs';
const fields = [
  'abstract',
  'problem',
  'method',
  'assumptions',
  'inputs',
  'outputs',
  'data',
  'tasks',
  'evaluation',
  'limitations',
  'conclusions',
  'deployment',
  'memory',
  'worldModel',
  'platform',
];
const stop = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'of',
  'in',
  'on',
  'and',
  'or',
  'to',
  'for',
  'what',
  'which',
  'how',
  'does',
  'do',
  'with',
  'by',
  '是否',
  '哪些',
  '什么',
  '如何',
  '的',
  '了',
]);
export function queryTerms(query) {
  const text = normalizeText(query);
  const segments =
    typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)]
          .filter((x) => x.isWordLike)
          .map((x) => x.segment)
      : text.split(' ');
  return [...new Set(segments.filter((x) => !stop.has(x) && x.trim()))];
}
function includes(text, term) {
  return /^[a-z0-9]+$/.test(term)
    ? new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(text)
    : text.includes(term);
}
function excerpt(text, terms) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const positions = terms.map((x) => lower.indexOf(x)).filter((x) => x >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 80);
  return (
    (start ? '…' : '') + source.slice(start, start + 420) + (start + 420 < source.length ? '…' : '')
  );
}
function passage(text, size = 1200) {
  const chunks = [];
  const value = String(text || '');
  for (let i = 0; i < value.length; i += size - 160) chunks.push(value.slice(i, i + size));
  return chunks;
}
export function enhancedSearch(data, query, options = {}) {
  const strategy = ['baseline', 'graph', 'ranked'].includes(options.strategy)
    ? options.strategy
    : 'ranked';
  const scope = ['all', 'metadata', 'notes', 'evidence', 'pdf'].includes(options.scope)
    ? options.scope
    : 'all';
  const papers = data.papers.filter((p) => inScope(data, p) && paperMatches(p, options));
  const paperIds = new Set(papers.map((p) => p.id));
  // Attachment text is deliberately impossible to query in public/static mode.
  const documents =
    data.scope === 'local' ? (options.documents || []).filter((d) => paperIds.has(d.paperId)) : [];
  const corpus = [];
  const add = (p, sourceType, text, weight, extra = {}) => {
    if (!text || (scope !== 'all' && scope !== sourceType)) return;
    for (const chunk of passage(text))
      corpus.push({ paperId: p.id, sourceType, fullText: chunk, weight, ...extra });
  };
  for (const p of papers) {
    add(
      p,
      'metadata',
      [p.id, p.title, p.acronym, ...(p.aliases || []), ...(p.authors || []), ...(p.tags || [])]
        .filter(Boolean)
        .join(' · '),
      5,
    );
    add(
      p,
      'metadata',
      fields
        .map((key) => p[key])
        .filter(Boolean)
        .join('\n'),
      2,
    );
    const entities = Object.values(p.facets || {})
      .flat()
      .map((id) => data.concepts.find((c) => c.id === id && inScope(data, c)))
      .filter(Boolean);
    add(
      p,
      'metadata',
      entities.map((c) => [c.title, ...(c.aliases || [])].join(' / ')).join('\n'),
      3,
    );
    let sectionId = '',
      body = [],
      fence = false;
    const usedHeadings = new Map();
    const flushNote = () => {
      add(p, 'notes', body.join('\n'), 1.5, sectionId ? { sectionId } : {});
      body = [];
    };
    for (const line of (p.note || '').split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const heading = !fence && line.match(/^#{1,3}\s+(.+)$/);
      if (heading) {
        flushNote();
        const slug =
          heading[1]
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-|-$/g, '') || 'section';
        const count = (usedHeadings.get(slug) || 0) + 1;
        usedHeadings.set(slug, count);
        sectionId = 'note-' + slug + (count > 1 ? '-' + count : '');
      }
      body.push(line);
    }
    flushNote();
    if (data.scope === 'local') add(p, 'notes', p.personalAnalysis, 1.2, { curatorAnalysis: true });
    for (const e of (data.evidence || []).filter((e) => e.paperId === p.id && inScope(data, e))) {
      add(p, 'evidence', e.text, 3, {
        evidenceId: e.id,
        evidenceStatus: e.status,
        kind: e.kind,
        ...(e.documentId ? { documentId: e.documentId, pageIndex: e.pageIndex } : {}),
        ...(e.locator ? { locator: e.locator } : {}),
      });
    }
  }
  for (const d of documents)
    for (const page of d.pages || [])
      add({ id: d.paperId }, 'pdf', page.text, 1, {
        documentId: d.id,
        pageIndex: page.pageIndex,
        pageLabel: page.pageLabel,
        warnings: page.warnings || [],
      });
  const terms = queryTerms(query);
  const expansions = new Map(terms.map((t) => [t, [t]]));
  // Vocabulary expansion is explicit exact alias normalization, not semantic similarity.
  if (strategy === 'ranked')
    for (const c of data.concepts || []) {
      if (!inScope(data, c)) continue;
      const names = [c.title, ...(c.aliases || [])].filter(Boolean).map(normalizeText);
      for (const term of terms)
        if (names.includes(term)) expansions.set(term, [...new Set([term, ...names])]);
    }
  const coverage = {
    scope,
    mode: data.scope === 'local' ? 'local' : 'public',
    paperCount: papers.length,
    documentCount: documents.length,
    pageCount: documents.reduce((n, d) => n + (d.pages || []).length, 0),
    unparsedPaperIds: papers
      .filter((p) => !documents.some((d) => d.paperId === p.id))
      .map((p) => p.id),
    searchedSources:
      scope === 'all'
        ? ['metadata', 'notes', 'evidence', ...(data.scope === 'local' ? ['pdf'] : [])]
        : [scope],
    tableExtraction: 'unchecked',
    formulaExtraction: 'unchecked',
    semanticSearch: false,
    minTermCoverage: strategy === 'ranked' ? 0.5 : 1,
    queryTerms: terms,
    aliasExpansions: Object.fromEntries([...expansions].filter(([t, v]) => v.length > 1)),
  };
  if (!terms.length) return { direct: [], expanded: [], evidence: [], coverage, strategy };
  const matched = corpus.map((row) => ({ ...row, normalized: normalizeText(row.fullText) }));
  const df = new Map(
    terms.map((t) => [
      t,
      matched.filter((row) => expansions.get(t).some((a) => includes(row.normalized, a))).length,
    ]),
  );
  let direct = matched
    .map((row) => {
      const found = terms.filter((t) => expansions.get(t).some((a) => includes(row.normalized, a)));
      if (
        !found.length ||
        (strategy === 'ranked' && found.length / terms.length < 0.5) ||
        (strategy !== 'ranked' && found.length !== terms.length)
      )
        return null;
      const score =
        strategy === 'ranked'
          ? row.weight *
            found.reduce((n, t) => n + Math.log(1 + (matched.length + 1) / (df.get(t) + 1)), 0) *
            (found.length / terms.length)
          : found.length;
      const { fullText, normalized, weight, ...result } = row;
      return {
        ...result,
        text: excerpt(
          fullText,
          found.flatMap((t) => expansions.get(t)),
        ),
        score: Number(score.toFixed(5)),
        matchedTerms: found,
        missingTerms: terms.filter((t) => !found.includes(t)),
        reason: `${row.sourceType}: ${found.join('、')}${found.length < terms.length ? '（部分词命中，不等于回答成立）' : ''}`,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.paperId.localeCompare(b.paperId) ||
        (a.pageIndex || 0) - (b.pageIndex || 0),
    );
  const seen = new Set();
  direct = direct
    .filter((row) => {
      const key = `${row.paperId}:${row.sourceType}:${row.evidenceId || ''}:${row.documentId || ''}:${row.pageIndex || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.min(100, Math.max(1, options.limit || 40)));
  const expanded = [],
    used = new Set(direct.map((x) => x.paperId));
  if (strategy === 'graph')
    for (const root of [...used]) {
      const graph = graphNeighborhood(data, root, options.hops || 2, {
        type: options.relationType,
      });
      for (const node of graph.nodes)
        if (node.nodeType === 'paper' && paperIds.has(node.id) && !used.has(node.id)) {
          const relation = graph.edges.find((e) => e.source === node.id || e.target === node.id);
          const ev = data.evidence.find(
            (e) => e.paperId === node.id && inScope(data, e) && e.status === 'verified',
          );
          expanded.push({
            paperId: node.id,
            sourceType: 'relation',
            score: 0,
            text: excerpt(ev?.text || node.abstract || node.title, terms),
            via: root,
            relationId: relation.id,
            ...(ev ? { evidenceId: ev.id } : {}),
            reason: `经已审核关系 ${relation.id} 扩展；不保证相关性，不作为原文明示`,
          });
          used.add(node.id);
        }
    }
  const evidenceIds = new Set([...direct, ...expanded].map((x) => x.evidenceId).filter(Boolean));
  return {
    direct,
    expanded,
    evidence: (data.evidence || []).filter((e) => inScope(data, e) && evidenceIds.has(e.id)),
    coverage,
    strategy,
  };
}
