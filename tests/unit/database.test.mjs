import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDatabase,
  makeView,
  queryRows,
  validateDatabase,
  groupRows,
  fieldsFor,
  csvRows,
  displayValue,
  valueOf,
  formulaReferences,
} from '../../src/lib/database.mjs';
const dataset = {
  topics: [],
  papers: [
    {
      id: 'a',
      title: 'Alpha',
      year: 2024,
      status: 'reading',
      tags: ['robot', 'memory'],
      customProperties: { score: 0, due: '2026-09-24', ready: false },
    },
    {
      id: 'b',
      title: 'Beta',
      year: 2025,
      tags: ['memory'],
      customProperties: { score: 12, due: '2026-10-01', ready: true },
    },
    { id: 'c', title: 'Gamma', year: 2025, lifecycle: 'archived', tags: [] },
    { id: 'd', title: 'Delta', year: 2023, tags: [] },
  ],
};
const db = {
  ...defaultDatabase(),
  properties: [
    { id: 'score', name: 'Score', type: 'number' },
    { id: 'due', name: 'Due', type: 'date' },
    { id: 'ready', name: 'Ready', type: 'checkbox' },
  ],
};
test('views evaluate nested AND/OR, metadata queries, typed numbers and dates without treating 0/false as missing', () => {
  assert.deepEqual(validateDatabase(db, dataset), []);
  const v = makeView();
  v.filters.rules = [
    {
      mode: 'or',
      rules: [
        { field: 'custom:score', op: 'is', value: 0 },
        { field: 'custom:due', op: 'lt', value: '2026-09-30' },
      ],
    },
    { field: 'custom:ready', op: 'is', value: false },
  ];
  assert.deepEqual(
    queryRows(dataset, db, v).map((p) => p.id),
    ['a'],
  );
  v.filters = { mode: 'and', rules: [{ field: 'custom:score', op: 'notEmpty' }] };
  assert.deepEqual(
    queryRows(dataset, db, v).map((p) => p.id),
    ['b', 'a'],
  );
  v.filters.rules = [];
  v.query = 'MEMORY';
  assert.deepEqual(
    queryRows(dataset, db, v).map((p) => p.id),
    ['b', 'a'],
  );
});
test('sorts use numeric order, stable tie breaking, empty values last and explicit archive inclusion', () => {
  const v = {
    ...makeView(),
    showArchived: true,
    sorts: [
      { field: 'custom:score', direction: 'desc' },
      { field: 'year', direction: 'asc' },
    ],
  };
  assert.deepEqual(
    queryRows(dataset, db, v).map((p) => p.id),
    ['b', 'a', 'd', 'c'],
  );
  v.sorts = [{ field: 'custom:score', direction: 'asc' }];
  assert.deepEqual(
    queryRows(dataset, db, v).map((p) => p.id),
    ['a', 'b', 'c', 'd'],
  );
});
test('multi-valued grouping preserves unassigned rows and CSV exports only selected columns, escaping formulas', () => {
  const groups = groupRows(
    dataset.papers,
    fieldsFor(db, dataset).find((f) => f.id === 'tags'),
  );
  assert.deepEqual(
    groups.find((g) => g.key === 'memory').papers.map((p) => p.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    groups.find((g) => g.key === '').papers.map((p) => p.id),
    ['c', 'd'],
  );
  const csv = csvRows(
    [{ title: '=HYPERLINK("https://example.org")', secret: 'PRIVATE' }],
    [{ id: 'title', name: '论文', type: 'text' }],
    dataset,
  );
  assert.match(csv, /'=HYPERLINK\(""https/);
  assert.doesNotMatch(csv, /PRIVATE/);
});
test('configuration rejects wrong property types, invalid dates, missing links and dangling view fields', () => {
  const cases = [
    { customProperties: { score: '12' } },
    { customProperties: { due: '2026-02-30' } },
    { customProperties: { unknown: 'secret' } },
  ];
  for (const record of cases)
    assert.ok(validateDatabase(db, { ...dataset, papers: [{ id: 'a', ...record }] }).length);
  const next = structuredClone(db);
  next.views[0].sorts[0].field = 'missing';
  assert.ok(validateDatabase(next, dataset).length);
  const relationDB = {
    ...defaultDatabase(),
    properties: [{ id: 'related', name: 'Related', type: 'relation' }],
  };
  assert.ok(
    validateDatabase(relationDB, {
      papers: [{ id: 'a', customProperties: { related: ['missing'] } }],
      topics: [],
    }).length,
  );
});

test('custom text and prototype-like names remain literal; checkbox group labels preserve false', () => {
  for (const value of ['public', 'reading', '__proto__', 'constructor', 'toString']) {
    assert.equal(displayValue(value, { id: 'custom:memo', type: 'text' }, dataset), value);
  }
  assert.equal(displayValue('false', { id: 'custom:ready', type: 'checkbox' }, dataset), '未勾选');
  assert.equal(displayValue('true', { id: 'custom:ready', type: 'checkbox' }, dataset), '已勾选');
});

test('formula and rollup properties compute deterministically and remain filterable without storing derived values', () => {
  const data = {
    topics: [],
    papers: [
      {
        id: 'a',
        title: 'Alpha',
        year: 2024,
        customProperties: { related: ['b', 'c'], score: 2 },
      },
      { id: 'b', title: 'Beta', year: 2025, customProperties: { score: 5 } },
      { id: 'c', title: 'Gamma', year: 2023, customProperties: { score: 7 } },
    ],
  };
  const database = {
    ...defaultDatabase(),
    properties: [
      { id: 'related', name: 'Related', type: 'relation' },
      { id: 'score', name: 'Score', type: 'number' },
      {
        id: 'age',
        name: 'Years since 2020',
        type: 'formula',
        resultType: 'number',
        expression: 'prop("year") - 2020',
      },
      {
        id: 'related-score',
        name: 'Related score',
        type: 'rollup',
        relation: 'related',
        source: 'custom:score',
        aggregate: 'sum',
      },
    ],
  };
  assert.deepEqual(validateDatabase(database, data), []);
  assert.deepEqual(formulaReferences('prop("year") - prop("score")'), ['year', 'score']);
  assert.equal(valueOf(data.papers[0], 'custom:age', database, data), 4);
  assert.equal(valueOf(data.papers[0], 'custom:related-score', database, data), 12);
  assert.equal(data.papers[0].customProperties.age, undefined);
  const view = makeView();
  view.filters.rules = [{ field: 'custom:related-score', op: 'gte', value: 10 }];
  assert.deepEqual(
    queryRows(data, database, view).map((paper) => paper.id),
    ['a'],
  );
});

test('computed property references reject unknown fields and cycles', () => {
  const data = { topics: [], papers: [{ id: 'a', title: 'A', year: 2024 }] };
  const unknown = {
    ...defaultDatabase(),
    properties: [
      {
        id: 'bad',
        name: 'Bad',
        type: 'formula',
        resultType: 'number',
        expression: 'prop("missing")',
      },
    ],
  };
  assert.ok(validateDatabase(unknown, data).some((error) => error.includes('unknown field')));
  const cycle = {
    ...defaultDatabase(),
    properties: [
      { id: 'a', name: 'A', type: 'formula', resultType: 'number', expression: 'prop("b")' },
      { id: 'b', name: 'B', type: 'formula', resultType: 'number', expression: 'prop("a")' },
    ],
  };
  assert.ok(validateDatabase(cycle, data).some((error) => error.includes('cycle')));
});
