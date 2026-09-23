import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPapers,
  retrieve,
  graphNeighborhood,
  comparisonMarkdown,
  statistics,
  readingContext,
} from '../../src/lib/knowledge.mjs';
import { emptyData, validateData, publicProjection } from '../../scripts/data.mjs';
export function fixture() {
  return {
    ...emptyData(),
    papers: [
      {
        schemaVersion: 1,
        id: 'paper-a',
        title: 'Memory VLA 记忆',
        authors: ['Author'],
        year: 2025,
        url: 'https://example.org/a',
        visibility: 'public',
        topics: [],
        privateNotes: 'DO_NOT_PUBLISH',
      },
      {
        schemaVersion: 1,
        id: 'paper-b',
        title: 'Policy learning',
        authors: [],
        year: 2024,
        url: 'https://example.org/b',
        visibility: 'public',
      },
      {
        schemaVersion: 1,
        id: 'private-paper',
        title: 'SECRET',
        authors: [],
        year: 2024,
        url: 'https://example.org/private',
        visibility: 'private',
      },
    ],
    evidence: [
      {
        schemaVersion: 1,
        id: 'ev-a',
        paperId: 'paper-a',
        kind: 'source',
        text: 'Memory stores 机器人轨迹 in a VLA policy.',
        status: 'verified',
        visibility: 'public',
      },
      {
        schemaVersion: 1,
        id: 'ev-b',
        paperId: 'paper-b',
        kind: 'source',
        text: 'Policy learning uses task demonstrations.',
        status: 'verified',
        visibility: 'public',
      },
      {
        schemaVersion: 1,
        id: 'ev-private',
        paperId: 'private-paper',
        kind: 'source',
        text: 'SECRET_EVIDENCE',
        status: 'verified',
        visibility: 'public',
      },
    ],
    relations: [
      {
        schemaVersion: 1,
        id: 'rel-approved',
        source: 'paper-a',
        target: 'paper-b',
        type: 'related',
        evidenceIds: ['ev-a'],
        origin: 'curator',
        status: 'approved',
        visibility: 'public',
      },
      {
        schemaVersion: 1,
        id: 'rel-private',
        source: 'paper-a',
        target: 'private-paper',
        type: 'related',
        evidenceIds: ['ev-private'],
        origin: 'curator',
        status: 'approved',
        visibility: 'public',
      },
    ],
  };
}
test('public projection removes private text and all dependent evidence/edges', () => {
  const out = publicProjection(fixture()),
    text = JSON.stringify(out);
  assert(!text.includes('SECRET'));
  assert(!text.includes('privateNotes'));
  assert(!text.includes('private-paper'));
  assert(!text.includes('DO_NOT_PUBLISH'));
  assert.equal(out.relations.length, 1);
});
test('Chinese substring, English case normalization and AND tokens', () => {
  const d = fixture();
  assert.equal(filterPapers(d, { q: '机器人' }).length, 1);
  assert.equal(filterPapers(d, { q: 'MEMORY VLA' }).length, 1);
  assert.equal(filterPapers(d, { q: 'memory nonexistent' }).length, 0);
  assert.equal(filterPapers(d, { q: 'memory', year: 2024 }).length, 0);
});
test('retrieval has evidence snippets and only approved graph expansion', () => {
  const d = fixture();
  assert.equal(retrieve(d, 'memory').expanded.length, 0);
  const r = retrieve(d, 'memory', { expand: true });
  assert.equal(r.direct[0].evidenceId, 'ev-a');
  assert.equal(r.expanded[0].paperId, 'paper-b');
  assert.equal(r.expanded[0].via, 'paper-a');
  d.relations[0].status = 'pending';
  assert.equal(retrieve(d, 'memory', { expand: true }).expanded.length, 0);
  assert.deepEqual(retrieve(d, 'nonexistent'), { direct: [], expanded: [], evidence: [] });
});
test('graph type filter and verified evidence enforcement', () => {
  const d = fixture();
  assert.equal(graphNeighborhood(d, 'paper-a', 2).edges.length, 1);
  assert.equal(graphNeighborhood(d, 'paper-a', 2, { type: 'uses' }).edges.length, 0);
  d.evidence[0].status = 'unverified';
  assert.equal(graphNeighborhood(d, 'paper-a', 2).edges.length, 0);
});
test('schema errors provide context for duplicates, refs, enums, arxiv versions', () => {
  const d = fixture();
  d.papers[0].arxiv = '2501.01234v1';
  d.papers[1].arxiv = '2501.01234v2';
  d.papers[1].status = 'wrong';
  d.papers[1].topics = ['missing'];
  d.concepts.push({
    schemaVersion: 1,
    id: 'paper-a',
    title: 'collision',
    kind: 'concept',
    visibility: 'public',
  });
  const errors = validateData(d).join('\n');
  assert.match(errors, /duplicate arxiv/);
  assert.match(errors, /duplicate global id/);
  assert.match(errors, /unknown topic/);
  assert.match(errors, /allowed values/);
});
test('entity kind dimensions reject semantically incompatible records', () => {
  const d = fixture();
  d.concepts.push({
    schemaVersion: 1,
    id: 'task-a',
    title: 'Task A',
    kind: 'task',
    dimension: 'environment',
    visibility: 'public',
  });
  const errors = validateData(d).join('\n');
  assert.match(errors, /dimension environment is not valid for kind task/);
  d.concepts[d.concepts.length - 1].dimension = 'task';
  assert.doesNotMatch(validateData(d).join('\n'), /task-a: dimension/);
});
test('comparison unknown stays unknown; deterministic counts exclude private papers', () => {
  const d = fixture();
  assert.match(comparisonMarkdown(d.papers.slice(0, 2), ['method']), /未知/);
  assert.equal(statistics(d).papers, 2);
  assert.deepEqual(statistics(d), statistics(d));
});
test('malformed fields return errors rather than throwing', () => {
  const d = fixture();
  d.papers[0].topics = { bad: true };
  d.relations[0].evidenceIds = 'not-an-array';
  assert.doesNotThrow(() => validateData(d));
  assert(validateData(d).length >= 2);
});
test('private supporting evidence hides an otherwise public relation', () => {
  const d = fixture();
  d.evidence[0].visibility = 'private';
  const out = publicProjection(d);
  assert.equal(out.relations.length, 0);
  assert(!JSON.stringify(out).includes('ev-a'));
});
test('graph expansion follows a shared concept in exactly two hops', () => {
  const d = fixture();
  d.relations = [];
  d.concepts = [
    {
      schemaVersion: 1,
      id: 'shared-concept',
      title: 'Shared',
      kind: 'concept',
      visibility: 'public',
    },
  ];
  for (const [n, p] of ['paper-a', 'paper-b'].entries())
    d.relations.push({
      schemaVersion: 1,
      id: `rel-${n}`,
      source: p,
      target: 'shared-concept',
      type: 'uses',
      evidenceIds: [n ? 'ev-b' : 'ev-a'],
      origin: 'curator',
      status: 'approved',
      visibility: 'public',
    });
  assert(!graphNeighborhood(d, 'paper-a', 1).nodes.some((n) => n.id === 'paper-b'));
  assert(graphNeighborhood(d, 'paper-a', 2).nodes.some((n) => n.id === 'paper-b'));
  assert.equal(retrieve(d, 'memory', { expand: true }).expanded[0].paperId, 'paper-b');
});
test('author names participate in normalized AND search', () => {
  const d = fixture();
  d.papers[0].authors = ['Moo Jin Kim'];
  assert.deepEqual(
    filterPapers(d, { q: 'MOO KIM' }).map((p) => p.id),
    ['paper-a'],
  );
  assert.equal(filterPapers(d, { q: 'Moo other' }).length, 0);
});
test('updated sort uses newest date, then year; missing dates sort last', () => {
  const d = fixture();
  d.papers[0].updated = '2026-01-02';
  d.papers[1].updated = '2026-03-01';
  assert.deepEqual(
    filterPapers(d, { sort: 'updated' }).map((p) => p.id),
    ['paper-b', 'paper-a'],
  );
  d.papers[1].updated = d.papers[0].updated;
  assert.deepEqual(
    filterPapers(d, { sort: 'updated' }).map((p) => p.id),
    ['paper-a', 'paper-b'],
  );
  delete d.papers[0].updated;
  assert.equal(filterPapers(d, { sort: 'updated' })[0].id, 'paper-b');
});
test('known RT-2 alias uses the full normalized phrase, including RT 2 spelling', () => {
  const d = fixture();
  d.papers[0].id = 'rt-2';
  d.papers[0].title = 'RT-2 Robot model';
  d.papers[0].acronym = 'RT-2';
  d.papers[0].authors = ['Author'];
  d.papers[1].title = 'Art methods version 2';
  d.papers[1].authors = ['Karl Pertsch'];
  d.evidence = [];
  for (const q of ['RT-2', 'RT 2'])
    assert.deepEqual(
      filterPapers(d, { q }).map((p) => p.id),
      ['rt-2'],
    );
  d.papers[1].note = 'We compare against RT-2 in this note.';
  assert.equal(filterPapers(d, { q: 'RT-2' }).length, 2);
});
test('minimal schema-valid topics get safe browser rendering defaults', () => {
  const d = fixture();
  d.topics = [{ schemaVersion: 1, id: 'topic-minimal', title: 'Minimal', visibility: 'public' }];
  const t = publicProjection(d).topics[0];
  assert.deepEqual(t.dimensions, []);
  assert.deepEqual(t.branches, []);
  assert.deepEqual(t.questions, []);
  assert.equal(t.description, '');
});
test('reading context distinguishes an external URL from attached full text and reading quality', () => {
  const paper = {
    id: 'paper-a',
    url: 'https://example.org/a',
    note: 'A short note',
    facets: { learning: ['method-a'] },
    topics: ['topic-a', 'archived'],
  };
  const context = readingContext(paper, {
    documents: [{ paperId: 'paper-b' }],
    topics: [{ id: 'topic-a' }, { id: 'archived', lifecycle: 'archived' }, { id: 'unrelated' }],
  });
  assert.equal(context.documentCount, 0);
  assert.equal(context.hasNote, true);
  assert.equal(context.facetCount, 1);
  assert.deepEqual(
    context.topics.map((t) => t.id),
    ['topic-a'],
  );
  assert.equal(
    readingContext({ ...paper, note: '  ' }, { documents: [{ paperId: paper.id }] }).hasNote,
    false,
  );
  assert.equal(readingContext(paper, { documents: [{ paperId: paper.id }] }).documentCount, 1);
});
