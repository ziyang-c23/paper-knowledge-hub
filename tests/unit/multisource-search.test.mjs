import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancedSearch } from '../../src/lib/search-v2.mjs';
const paper = {
  id: 'example',
  title: 'Example',
  year: 2024,
  authors: [],
  visibility: 'public',
  topics: [],
  sources: [
    {
      id: 's-one',
      type: 'code-observation',
      title: 'ActionTokenizer',
      text: 'digitize clip bins',
      url: 'https://example.org/code',
      revision: 'abc123',
      visibility: 'private',
    },
    {
      id: 's-two',
      title: 'Documentation',
      text: 'digitize interval boundaries',
      visibility: 'public',
    },
  ],
};
const data = {
  scope: 'local',
  papers: [paper],
  concepts: [],
  topics: [],
  evidence: [],
  relations: [],
};
test('multi-source search keeps separate hits, revision and source location', () => {
  const r = enhancedSearch(data, 'digitize', { scope: 'sources' });
  assert.equal(r.direct.length, 2);
  assert.equal(r.direct.find((x) => x.sourceId === 's-one').sourceRevision, 'abc123');
  assert.equal(r.direct.find((x) => x.sourceId === 's-one').sourceUrl, 'https://example.org/code');
});
test('private source text cannot be searched in public mode even before projection', () => {
  assert.equal(
    enhancedSearch({ ...data, scope: 'public' }, 'clip', { scope: 'sources' }).direct.length,
    0,
  );
  assert.equal(
    enhancedSearch({ ...data, scope: 'public' }, 'digitize', { scope: 'sources' }).direct.length,
    1,
  );
});

test('legacy public sources cannot bypass authoritative private source visibility', () => {
  const d = {
    ...data,
    scope: 'public',
    papers: [
      {
        ...paper,
        sourceBundle: [{ id: 's-one', visibility: 'public', text: 'legacyleak' }],
      },
    ],
  };
  assert.equal(enhancedSearch(d, 'legacyleak').direct.length, 0);
});

test('saved code symbols and paths are searchable with exact locations preserved', () => {
  const d = {
    ...data,
    papers: [
      {
        ...paper,
        sources: [
          {
            id: 'code',
            title: 'Implementation',
            type: 'official-code',
            path: 'octo/model/action_head.py',
            symbol: 'sample_actions',
            revision: 'deadbeef',
            locator: 'L120–L148',
            url: 'https://example.org/code#L120-L148',
          },
        ],
      },
    ],
  };
  const result = enhancedSearch(d, 'sample_actions', { scope: 'sources', strategy: 'baseline' });
  assert.equal(result.direct.length, 1);
  assert.equal(result.direct[0].sourcePath, 'octo/model/action_head.py');
  assert.equal(result.direct[0].sourceSymbol, 'sample_actions');
  assert.equal(result.direct[0].locator, 'L120–L148');
  assert.equal(enhancedSearch(d, 'action_head.py', { strategy: 'baseline' }).direct.length, 1);
});

test('existing video observations and transcripts retain timestamp zero', () => {
  const d = {
    ...data,
    papers: [
      {
        ...paper,
        media: [
          {
            id: 'video',
            type: 'official-video',
            start: 0,
            end: 12,
            transcript: 'unexpected grasp adjustment',
            url: 'https://example.org/demo',
          },
        ],
      },
    ],
  };
  const result = enhancedSearch(d, 'adjustment');
  assert.equal(result.direct[0].mediaStart, 0);
  assert.equal(result.direct[0].mediaEnd, 12);
  assert.equal(enhancedSearch({ ...d, scope: 'public' }, 'adjustment').direct.length, 0);
});

test('reading records are distinct located hits and are never indexed publicly', () => {
  const readingRecords = [
    {
      paperId: 'example',
      entries: [
        {
          id: 'r1',
          text: 'Why horizon?',
          quote: 'observations refresh',
          section: 'note-方法',
          documentId: 'doc-one',
          pageIndex: 3,
        },
        { id: 'r2', text: 'Another horizon question' },
      ],
    },
    { paperId: 'missing', entries: [{ id: 'r3', text: 'horizon excluded' }] },
  ];
  const result = enhancedSearch(data, 'horizon', { readingRecords, scope: 'reading' });
  assert.equal(result.direct.length, 2);
  assert.deepEqual(result.direct.map((r) => r.readingRecordId).sort(), ['r1', 'r2']);
  const located = result.direct.find((r) => r.readingRecordId === 'r1');
  assert.equal(located.documentId, 'doc-one');
  assert.equal(located.pageIndex, 3);
  assert.equal(located.sectionId, 'note-方法');
  assert.equal(result.coverage.readingRecordCount, 2);
  assert.equal(
    enhancedSearch({ ...data, scope: 'public' }, 'horizon', { readingRecords }).direct.length,
    0,
  );
});

test('topic full text retains topic identity, privacy and paper-filter boundaries', () => {
  const d = {
    ...data,
    papers: [{ ...paper, topics: ['topic-one'] }],
    topics: [
      {
        id: 'topic-one',
        title: 'Synthesis',
        visibility: 'private',
        analysis: 'mechanismlink rationale',
        gaps: ['unresolvedneedle'],
      },
      {
        id: 'topic-two',
        title: 'Another',
        visibility: 'public',
        description: 'mechanismlink comparison',
      },
    ],
  };
  const r = enhancedSearch(d, 'mechanismlink', { strategy: 'graph' });
  assert.equal(r.direct.length, 2);
  assert.ok(r.direct.every((hit) => hit.targetType === 'topic' && !hit.paperId));
  assert.equal(r.expanded.length, 0);
  assert.equal(enhancedSearch(d, 'unresolvedneedle').direct[0].topicId, 'topic-one');
  assert.equal(enhancedSearch(d, 'mechanismlink', { paperId: 'example' }).direct.length, 1);
  assert.equal(
    enhancedSearch({ ...d, scope: 'public' }, 'mechanismlink').direct[0].topicId,
    'topic-two',
  );
  assert.equal(enhancedSearch({ ...d, scope: 'public' }, 'unresolvedneedle').direct.length, 0);
});
