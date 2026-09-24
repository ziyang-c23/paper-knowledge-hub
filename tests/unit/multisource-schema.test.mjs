import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, publicProjection, validateData } from '../../scripts/data.mjs';
const base = {
  schemaVersion: 1,
  id: 'paper-multi',
  title: 'Multi source',
  year: 2025,
  authors: ['A'],
  url: 'https://arxiv.org/abs/2405.12213v2',
  arxiv: '2405.12213v2',
  visibility: 'public',
};
test('canonical privacy wins over legacy duplicates and derived visualization references', () => {
  const data = {
    ...emptyData(),
    papers: [
      {
        ...base,
        sources: [{ id: 'code', visibility: 'private', text: 'CURRENT_PRIVATE' }],
        sourceBundle: [{ id: 'code', visibility: 'public', text: 'STALE_PUBLIC' }],
        explanations: [
          { title: 'Derived', body: 'PRIVATE_EXPLANATION', sourceRevisions: { code: 'v1' } },
        ],
        visuals: {
          method: { steps: [{ id: 'step', label: 'PRIVATE_STEP', sourceIds: ['code'] }] },
        },
      },
    ],
  };
  const result = publicProjection(data).papers[0];
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.explanations, []);
  assert.deepEqual(result.visuals.method.steps, []);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|STALE_PUBLIC/);
});
test('multisource paper fields validate and remain available in public projection', () => {
  const data = {
    ...emptyData(),
    papers: [
      {
        ...base,
        sourceBundle: {
          title: 'Reading bundle',
          items: [
            {
              id: 'paper-pdf',
              visibility: 'public',
              label: 'PDF',
              kind: 'pdf',
              url: 'https://arxiv.org/pdf/2405.12213v2',
              locator: 'p. 1',
            },
          ],
        },
        explanations: [
          {
            id: 'why',
            visibility: 'public',
            title: 'Why it matters',
            body: 'A short explanation.',
            section: 'overview',
            sourceIds: ['paper-pdf'],
          },
        ],
        media: [
          {
            id: 'fig-1',
            visibility: 'public',
            type: 'figure',
            url: 'https://example.org/figure.png',
            caption: 'Overview',
            alt: 'Overview figure',
            sourceId: 'paper-pdf',
          },
        ],
        visualNarratives: [
          {
            id: 'flow',
            visibility: 'public',
            title: 'Flow',
            summary: 'A visual route',
            steps: [{ id: 'step-1', label: 'Input', mediaIds: ['fig-1'] }],
            mediaIds: ['fig-1'],
            sourceIds: ['paper-pdf'],
          },
        ],
      },
    ],
  };
  assert.deepEqual(validateData(data), []);
  const projected = publicProjection(data).papers[0];
  assert.equal(projected.sources[0].url, 'https://arxiv.org/pdf/2405.12213v2');
  assert.equal(projected.sourceBundle, undefined);
  assert.equal(projected.explanations[0].body, 'A short explanation.');
  assert.equal(projected.visualNarratives[0].steps[0].mediaIds[0], 'fig-1');
});
test('nested local document links are projected to canonical public sources', () => {
  const data = {
    ...emptyData(),
    papers: [
      {
        ...base,
        sourceBundle: [
          {
            id: 'local',
            visibility: 'public',
            label: 'PDF',
            url: 'https://arxiv.org/pdf/2405.12213v2',
            summary: '[原文](/api/documents/doc-local/file#page=2)',
            href: '/api/documents/doc-local/file#page=4',
          },
        ],
        explanations: [
          {
            id: 'e',
            visibility: 'public',
            title: 'Read',
            body: '[PDF](#/document/doc-local?page=3)',
          },
        ],
      },
    ],
  };
  const projected = publicProjection(data).papers[0];
  assert.equal(projected.sources[0].summary, '[原文](https://arxiv.org/pdf/2405.12213v2#page=2)');
  assert.equal(projected.sources[0].href, 'https://arxiv.org/pdf/2405.12213v2#page=4');
  assert.equal(projected.explanations[0].body, '[PDF](https://arxiv.org/pdf/2405.12213v2#page=3)');
  assert.equal(projected.sources[0].href, 'https://arxiv.org/pdf/2405.12213v2#page=4');
});
test('nested private annotations do not cross the public projection boundary', () => {
  const data = {
    ...emptyData(),
    papers: [
      {
        ...base,
        sourceBundle: [
          {
            id: 'public',
            visibility: 'public',
            label: 'Public',
            url: 'https://example.org/public',
            privateNotes: 'SECRET',
          },
          {
            id: 'hidden',
            visibility: 'private',
            label: 'Hidden',
            url: 'https://example.org/hidden',
          },
        ],
        explanations: [
          {
            id: 'e',
            visibility: 'public',
            title: 'Public',
            body: 'Shown',
            internalNotes: 'SECRET_INTERNAL',
          },
        ],
      },
    ],
  };
  const projected = publicProjection(data).papers[0];
  assert.equal(projected.sources.length, 1);
  assert.equal(projected.sources[0].privateNotes, undefined);
  assert.equal(projected.explanations[0].internalNotes, undefined);
  assert.doesNotMatch(JSON.stringify(projected), /SECRET/);
});

test('prompt-compatible source list and explanation/narrative maps are accepted', () => {
  const data = {
    ...emptyData(),
    papers: [
      {
        ...base,
        sources: [
          {
            id: 'source-code',
            type: 'official-code',
            url: 'https://github.com/example/repo',
            revision: '1a2b3c',
            title: 'Official implementation',
            status: 'read',
            visibility: 'private',
            supports: ['method'],
            limitations: ['does not prove reported result'],
          },
        ],
        explanations: {
          quickRead: { body: 'Read this first', sourceIds: ['source-code'] },
          methodWalkthrough: { body: 'Flow', sourceIds: ['source-code'] },
        },
        media: [
          {
            type: 'official-video',
            url: 'https://example.org/demo.mp4',
            start: '00:42',
            end: '01:08',
            caption: 'Demo',
            observation: 'Observed',
            cannotInfer: 'Not a success rate',
          },
        ],
        visualNarratives: {
          methodFlow: { steps: [{ id: 'step-a', sourceIds: ['source-code'] }] },
          timeline: {},
          comparison: {},
        },
      },
    ],
  };
  assert.deepEqual(validateData(data), []);
  const projected = publicProjection(data).papers[0];
  assert.equal(projected.sources.length, 0);
  assert.equal(projected.explanations.quickRead, undefined);
  assert.equal(projected.visualNarratives.methodFlow, undefined);
});

test('new explanation collections require explicit publication for array and map forms', () => {
  for (const field of ['explanations', 'visualNarratives']) {
    const entries = [
      { id: 'unreviewed', body: 'UNREVIEWED_MARKER' },
      { id: 'private', visibility: 'private', body: 'PRIVATE_MARKER' },
      { id: 'approved', visibility: 'public', body: 'APPROVED_MARKER' },
    ];
    for (const value of [entries, Object.fromEntries(entries.map((item) => [item.id, item]))]) {
      const result = publicProjection({ ...emptyData(), papers: [{ ...base, [field]: value }] })
        .papers[0];
      assert.doesNotMatch(JSON.stringify(result), /UNREVIEWED_MARKER|PRIVATE_MARKER/);
      assert.match(JSON.stringify(result), /APPROVED_MARKER/);
    }
  }
});
