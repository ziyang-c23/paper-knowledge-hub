import test from 'node:test';
import assert from 'node:assert/strict';
import { paperSources, sourceFreshness } from '../../src/lib/sources.mjs';

test('canonical sources shadow legacy IDs without merging stale or private fields', () => {
  const paper = {
    sources: [{ id: 'code', visibility: 'private', revision: 'new' }],
    sourceBundle: {
      sources: [
        { id: 'code', visibility: 'public', revision: 'old', text: 'Legacy text' },
        { id: 'pdf', label: 'Paper' },
      ],
    },
  };
  const sources = paperSources(paper);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], paper.sources[0]);
  assert.equal(paper.sourceBundle.sources.length, 2);
});

test('anonymous sources deduplicate only equivalent locations and versions', () => {
  const source = { url: 'https://example.org/code', path: 'action.py', revision: 'v1' };
  assert.equal(
    paperSources({
      sources: [source],
      sourceBundle: [source, { ...source, revision: 'v2' }, { ...source, path: 'data.py' }],
    }).length,
    3,
  );
});

test('revision matching never certifies unversioned, missing or unchecked material', () => {
  const paper = { sources: [{ id: 'code', revision: 'v2' }, { id: 'page' }] };
  assert.equal(sourceFreshness(paper, { sourceRevisions: { code: 'v1' } }).status, 'stale');
  assert.equal(sourceFreshness(paper, { sourceRevisions: { code: 'v2' } }).status, 'current');
  assert.equal(sourceFreshness(paper, { sourceIds: ['code'] }).status, 'unknown');
  assert.equal(sourceFreshness(paper, { sourceRevisions: { page: 'v1' } }).status, 'unknown');
  assert.equal(sourceFreshness(paper, { sourceIds: ['deleted'] }).status, 'missing');
  assert.equal(sourceFreshness(paper, {}).status, 'unknown');
  assert.equal(
    sourceFreshness(paper, {
      sourceIds: ['page'],
      sourceRevisions: { code: 'v1' },
    }).status,
    'stale',
  );
});
