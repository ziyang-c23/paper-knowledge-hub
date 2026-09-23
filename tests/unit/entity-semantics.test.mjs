import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entityConnections,
  entityDimensions,
  entityGroupFor,
  entityGroups,
  effectiveEntityKind,
} from '../../src/lib/entities.mjs';

test('entity groups keep legacy task/environment concepts discoverable while separating open questions', () => {
  assert.deepEqual(
    entityGroups.map((group) => group.id),
    ['people', 'methods', 'data', 'concepts', 'tasks', 'questions'],
  );
  const legacyTask = { kind: 'concept', dimension: 'task' };
  const legacyEnvironment = { kind: 'concept', dimension: 'environment' };
  assert.equal(effectiveEntityKind(legacyTask), 'task');
  assert.equal(effectiveEntityKind(legacyEnvironment), 'environment');
  assert.equal(entityGroupFor(legacyTask).id, 'tasks');
  assert.equal(entityGroupFor(legacyEnvironment).id, 'data');
  assert.equal(entityGroupFor({ kind: 'problem' }).id, 'questions');
  assert.deepEqual(entityDimensions.problem, ['problem']);
  assert.ok(entityDimensions.concept.includes('environment'));
});

test('entity connections distinguish facet taxonomy from verified paper relations', () => {
  const dataset = {
    papers: [
      { id: 'paper-taxonomy', lifecycle: 'active', facets: { task: ['task-a'] } },
      { id: 'paper-verified', lifecycle: 'active', facets: {} },
      { id: 'paper-pending', lifecycle: 'active', facets: {} },
    ],
    topics: [],
    concepts: [
      { id: 'task-a', kind: 'task', title: 'Task A' },
      { id: 'method-a', kind: 'method', title: 'Method A', relatedIds: ['paper-verified'] },
    ],
    evidence: [
      { id: 'ev-verified', paperId: 'paper-verified', kind: 'source', status: 'verified' },
      { id: 'ev-pending', paperId: 'paper-pending', kind: 'model', status: 'unverified' },
    ],
    relations: [
      {
        id: 'rel-verified',
        source: 'paper-verified',
        target: 'task-a',
        type: 'uses',
        evidenceIds: ['ev-verified'],
        origin: 'source',
        status: 'approved',
      },
      {
        id: 'rel-pending',
        source: 'paper-pending',
        target: 'task-a',
        type: 'uses',
        evidenceIds: ['ev-pending'],
        origin: 'model',
        status: 'pending',
      },
    ],
  };
  const result = entityConnections(dataset, 'task-a');
  assert.deepEqual(
    result.taxonomyPapers.map((paper) => paper.id),
    ['paper-taxonomy'],
  );
  assert.deepEqual(
    result.evidencePapers.map((paper) => paper.id),
    ['paper-verified'],
  );
  assert.deepEqual(result.manualPapers, []);
  assert.deepEqual(
    result.verifiedRelations.map((relation) => relation.id),
    ['rel-verified'],
  );
  assert.deepEqual(result.papers.map((paper) => paper.id).sort(), [
    'paper-taxonomy',
    'paper-verified',
  ]);
});
