import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, publicProjection, validateData } from '../../scripts/data.mjs';
const paper = (id, extra = {}) => ({
  schemaVersion: 1,
  id,
  title: id,
  authors: [],
  year: 2024,
  url: 'https://arxiv.org/abs/2405.12213v2',
  visibility: 'public',
  ...extra,
});

test('public prose resolves local PDFs and unpublished references without leaking private records', () => {
  const data = {
    ...emptyData(),
    papers: [
      paper('public-paper', {
        note: '[本地完整 PDF](/api/documents/doc-one/file#page=3)\n[原文](#/document/doc-one?page=4)\n[related](#/paper/private-paper)\n[hidden](#/paper/hidden-paper)\n[known](#/paper/other-paper)\n[missing](#/topic/private-topic)\n`[example](#/paper/private-paper)`',
      }),
      paper('other-paper'),
      paper('private-paper', {
        visibility: 'private',
        title: 'PRIVATE TITLE',
        note: 'PRIVATE NOTES',
        arxiv: '2210.03094',
        url: 'https://private.example/token',
        version: 'v1',
      }),
      paper('hidden-paper', { visibility: 'private', url: 'https://private.example/secret' }),
    ],
  };
  const original = structuredClone(data);
  const projected = publicProjection(data);
  const note = projected.papers.find((p) => p.id === 'public-paper').note;
  assert.ok(note.includes('[官方 PDF](https://arxiv.org/pdf/2405.12213v2#page=3)'));
  assert.ok(note.includes('[原文](https://arxiv.org/pdf/2405.12213v2#page=4)'));
  assert.ok(note.includes('[related（外部参考）](https://arxiv.org/abs/2210.03094v1)'));
  assert.ok(note.includes('hidden（未公开参考）'));
  assert.ok(note.includes('[known](#/paper/other-paper)'));
  assert.ok(note.includes('missing（未公开参考）'));
  assert.ok(note.includes('`[example](#/paper/private-paper)`'));
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE TITLE|PRIVATE NOTES|private\.example/);
  assert.deepEqual(data, original);
  assert.deepEqual(validateData(projected), []);
});

test('reference links and topic fields share projection rules; generic pages do not get PDF anchors', () => {
  const data = {
    ...emptyData(),
    papers: [
      paper('public-paper', {
        url: 'https://example.org/article',
        note: '[本地 PDF](#/document/doc-one?page=9)\n[resource][hidden]\n\n[hidden]: #/paper/private-paper',
      }),
      paper('private-paper', {
        visibility: 'private',
        arxiv: '2405.12213',
        url: '',
        version: 'v3',
      }),
    ],
    topics: [
      {
        schemaVersion: 1,
        id: 'topic-a',
        title: 'Topic',
        visibility: 'public',
        description: '[reference](#/paper/private-paper)',
        analysis: '[ref][]\n\n[ref]: #/paper/private-paper',
        questions: ['[question](#/paper/private-paper)'],
        gaps: ['[absent](#/topic/missing)'],
        comparisonQuestion: 'action',
      },
    ],
  };
  const projected = publicProjection(data);
  assert.ok(projected.papers[0].note.includes('[外部原文](https://example.org/article)'));
  assert.ok(
    projected.papers[0].note.includes('[resource（外部参考）](https://arxiv.org/abs/2405.12213v3)'),
  );
  assert.doesNotMatch(projected.papers[0].note, /#page|\]\]/);
  assert.ok(
    projected.topics[0].analysis.includes('[ref（外部参考）](https://arxiv.org/abs/2405.12213v3)'),
  );
  assert.equal(projected.topics[0].comparisonQuestion, 'action');
  assert.equal(projected.topics[0].gaps[0], 'absent（未公开参考）');
  assert.deepEqual(validateData(projected), []);
});
