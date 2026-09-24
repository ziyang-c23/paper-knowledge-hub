import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancedSearch } from '../../src/lib/search-v2.mjs';
import { filterPapers, graphNeighborhood, statistics } from '../../src/lib/knowledge.mjs';
const fixture = () => ({
  scope: 'local',
  papers: [
    {
      id: 'one',
      title: 'Alpha policy',
      year: 2024,
      visibility: 'private',
      lifecycle: 'active',
      note: 'A memory mechanism',
      facets: { memory: ['memory-concept'] },
    },
    {
      id: 'two',
      title: 'Beta architecture',
      year: 2025,
      visibility: 'public',
      lifecycle: 'archived',
    },
    { id: 'three', title: 'Gamma', year: 2023, visibility: 'private', lifecycle: 'draft' },
  ],
  topics: [],
  concepts: [
    {
      id: 'memory-concept',
      title: 'Memory',
      aliases: ['记忆'],
      kind: 'concept',
      visibility: 'private',
    },
  ],
  evidence: [
    {
      id: 'ev-one',
      paperId: 'one',
      text: 'Alpha policy uses memory',
      status: 'verified',
      visibility: 'private',
    },
  ],
  relations: [
    {
      id: 'rel-one',
      source: 'one',
      target: 'two',
      status: 'approved',
      origin: 'curator',
      evidenceIds: ['ev-one'],
      visibility: 'private',
      type: 'related',
    },
    {
      id: 'rel-two',
      source: 'one',
      target: 'three',
      status: 'approved',
      origin: 'curator',
      evidenceIds: ['ev-one'],
      visibility: 'private',
      type: 'related',
    },
  ],
});
const documents = [
  {
    id: 'doc-test',
    paperId: 'one',
    pages: [
      {
        pageIndex: 7,
        pageLabel: 'File page 7',
        text: 'Causal diffusion optimization on this source page',
        warnings: ['tables-unchecked'],
      },
    ],
  },
];
test('local private records are visible, archived excluded across listing, graph and search', () => {
  const d = fixture();
  assert.equal(filterPapers(d).length, 2);
  assert.equal(filterPapers(d, { lifecycle: 'archived' })[0].id, 'two');
  assert.equal(filterPapers(d, { facets: { memory: 'memory-concept' } }).length, 1);
  assert.equal(statistics(d).papers, 2);
  assert(!graphNeighborhood(d, 'one', 2).nodes.some((x) => x.id === 'two'));
  assert.equal(enhancedSearch(d, 'Beta').direct.length, 0);
});
test('PDF result preserves source file ordinal and sparse corpus coverage', () => {
  const r = enhancedSearch(fixture(), 'diffusion', { scope: 'pdf', documents });
  assert.equal(r.direct[0].pageIndex, 7);
  assert.equal(r.direct[0].documentId, 'doc-test');
  assert.equal(r.direct[0].sourceType, 'pdf');
  assert.deepEqual(r.coverage.unparsedPaperIds, ['three']);
  assert.equal(r.coverage.semanticSearch, false);
});
test('static/public search cannot receive private notes, documents or aliases', () => {
  const d = fixture();
  delete d.scope;
  d.papers[1].lifecycle = 'active';
  d.papers[1].personalAnalysis = 'UNAUTHORIZED';
  assert.equal(enhancedSearch(d, 'diffusion', { documents }).direct.length, 0);
  assert.equal(enhancedSearch(d, 'UNAUTHORIZED').direct.length, 0);
  assert.equal(enhancedSearch(d, 'memory').direct.length, 0);
});
test('ranked lexical retrieval reports missing words; baseline keeps conjunctive rule', () => {
  const d = fixture();
  assert.equal(enhancedSearch(d, 'memory nonexistent', { strategy: 'baseline' }).direct.length, 0);
  const r = enhancedSearch(d, 'memory nonexistent', { strategy: 'ranked' });
  assert(r.direct.length > 0);
  assert.deepEqual(r.direct[0].missingTerms, ['nonexistent']);
  assert.match(r.direct[0].reason, /部分词命中/);
  assert.equal(enhancedSearch(d, 'no-such-zebra').direct.length, 0);
});
test('approved relation expansion remains separate; pending and archived cannot expand', () => {
  const d = fixture();
  const r = enhancedSearch(d, 'Alpha', { strategy: 'graph' });
  assert.deepEqual(
    r.expanded.map((x) => x.paperId),
    ['three'],
  );
  assert.equal(r.expanded[0].via, 'one');
  d.relations[1].status = 'pending';
  assert.equal(enhancedSearch(d, 'Alpha', { strategy: 'graph' }).expanded.length, 0);
});
test('live dataset edit invalidates search immediately and aliases are visible reasons', () => {
  const d = fixture();
  const r = enhancedSearch(d, '记忆');
  assert(r.direct.length > 0);
  assert.deepEqual(r.coverage.aliasExpansions['记忆'], ['记忆', 'memory']);
  d.papers[0].note = 'revised';
  d.papers[0].facets = {};
  d.evidence = [];
  assert.equal(enhancedSearch(d, 'memory').direct.length, 0);
});

test('ranked rejects a single generic overlap in a mostly missing three-term query', () => {
  assert.equal(enhancedSearch(fixture(), 'alpha UNKNOWN987 QZZ654').direct.length, 0);
});

test('paperId filter restricts corpus, coverage, and PDF results', () => {
  const d = fixture();
  assert.equal(enhancedSearch(d, 'memory', { paperId: 'three', documents }).direct.length, 0);
  const r = enhancedSearch(d, 'diffusion', { paperId: 'one', documents });
  assert.equal(r.coverage.paperCount, 1);
  assert.equal(r.direct[0].paperId, 'one');
});

test('note results retain their chapter destination without parsing fenced headings', () => {
  const d = fixture();
  d.papers[0].note =
    '## 方法\n\nA uniquecontroltoken mechanism\n\n```\n## Fake\n```\n\nMore uniquecontroltoken\n\n## 实验\n\nOther results';
  const results = enhancedSearch(d, 'uniquecontroltoken', { scope: 'notes' });
  assert.ok(results.direct.length);
  assert.ok(results.direct.every((result) => result.sectionId === 'note-方法'));
});
