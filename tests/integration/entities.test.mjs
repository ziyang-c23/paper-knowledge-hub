import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initializeWorkspace,
  putRecord,
  readWorkspace,
  backupWorkspace,
  restoreWorkspace,
} from '../../services/workspace-store.mjs';
import { publicProjection, validateData } from '../../scripts/data.mjs';
import { entityConnections, entityExport } from '../../src/lib/entities.mjs';
import { graphNeighborhood } from '../../src/lib/knowledge.mjs';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-entities-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'content/papers'), { recursive: true });
  await writeFile(
    path.join(root, 'content/papers/paper-a.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'paper-a',
      title: 'Synthetic paper',
      year: 2026,
      authors: [],
      url: 'https://example.org/paper',
      visibility: 'public',
    }),
  );
  const store = await initializeWorkspace(root, { write: true });
  return { root, store };
}
const entity = (id, kind, extra = {}) => ({
  schemaVersion: 1,
  id,
  kind,
  title: 'Synthetic ' + id,
  visibility: 'private',
  ...extra,
});
test('typed scholar and institution records preserve stable cross references and private source notes through rename/backup/restore', async (t) => {
  const { root, store } = await fixture(t);
  let current = await putRecord(root, {
    collection: 'concepts',
    record: entity('lab-a', 'institution'),
    expectedRevision: store.revision,
  });
  current = await putRecord(root, {
    collection: 'concepts',
    record: entity('person-a', 'person', {
      note: 'PRIVATE-DOSSIER',
      relatedIds: ['lab-a', 'paper-a'],
      sources: [
        {
          title: 'Official profile',
          url: 'https://example.org/profile',
          note: 'PRIVATE-SOURCE-NOTE',
        },
      ],
    }),
    expectedRevision: current.revision,
  });
  const backup = await backupWorkspace(root);
  current = await putRecord(root, {
    collection: 'concepts',
    record: { ...current.dataset.concepts[0], title: 'Renamed institution' },
    expectedRevision: current.revision,
  });
  const connection = entityConnections(current.dataset, 'person-a');
  assert.equal(connection.outgoing[0].title, 'Renamed institution');
  assert.equal(connection.papers[0].id, 'paper-a');
  assert.equal(entityConnections(current.dataset, 'lab-a').incoming[0].id, 'person-a');
  assert.match(entityExport(current.dataset.concepts[1], current.dataset), /PRIVATE-DOSSIER/);
  current = await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: current.revision,
    write: true,
  });
  assert.equal(current.dataset.concepts[0].title, 'Synthetic lab-a');
  assert.equal(current.dataset.concepts[1].sources[0].note, 'PRIVATE-SOURCE-NOTE');
});
test('unknown/self references fail atomically and extended private entity fields cannot leak to public projection', async (t) => {
  const { root, store } = await fixture(t);
  for (const relatedIds of [['missing'], ['person-a']])
    await assert.rejects(
      () =>
        putRecord(root, {
          collection: 'concepts',
          record: entity('person-a', 'person', { relatedIds }),
          expectedRevision: store.revision,
        }),
      (e) => e.status === 422,
    );
  assert.equal((await readWorkspace(root)).revision, store.revision);
  const current = await putRecord(root, {
    collection: 'concepts',
    record: entity('person-a', 'person', {
      visibility: 'public',
      note: 'SECRET',
      url: 'https://example.org/private-source',
      sources: [{ title: 'Private intake', url: 'https://example.org/intake' }],
      relatedIds: ['paper-a'],
    }),
    publishConsent: true,
    expectedRevision: store.revision,
  });
  const projection = publicProjection(current.dataset);
  assert.equal(projection.concepts[0].kind, 'person');
  assert.doesNotMatch(
    JSON.stringify(projection),
    /SECRET|private-source|Private intake|relatedIds|sources/,
  );
});
test('archived entities leave active graph and public output while their identity and references remain recoverable', async (t) => {
  const { root, store } = await fixture(t);
  let current = await putRecord(root, {
    collection: 'concepts',
    record: entity('person-a', 'person', { visibility: 'public' }),
    publishConsent: true,
    expectedRevision: store.revision,
  });
  current = await putRecord(root, {
    collection: 'concepts',
    record: { ...current.dataset.concepts[0], lifecycle: 'archived' },
    publishConsent: true,
    expectedRevision: current.revision,
  });
  assert.equal(publicProjection(current.dataset).concepts.length, 0);
  assert.ok(
    !graphNeighborhood({ ...current.dataset, scope: 'local' }, '*').nodes.some(
      (n) => n.id === 'person-a',
    ),
  );
  assert.equal((await readWorkspace(root)).dataset.concepts[0].id, 'person-a');
  assert.deepEqual(validateData(current.dataset), []);
});

test('create-only prevents a new entity form from replacing an existing stable record', async (t) => {
  const { root, store } = await fixture(t);
  const first = await putRecord(root, {
    collection: 'concepts',
    record: entity('person-a', 'person', { note: 'KEEP-ORIGINAL' }),
    expectedRevision: store.revision,
    createOnly: true,
  });
  await assert.rejects(
    () =>
      putRecord(root, {
        collection: 'concepts',
        record: entity('person-a', 'person', { title: 'Accidental replacement' }),
        expectedRevision: first.revision,
        createOnly: true,
      }),
    (e) => e.status === 409,
  );
  assert.equal((await readWorkspace(root)).dataset.concepts[0].note, 'KEEP-ORIGINAL');
});

test('rejected and unreviewed model links remain inspectable but never count as established paper associations', () => {
  const dataset = {
    papers: [{ id: 'paper-a', title: 'Paper' }],
    topics: [],
    concepts: [entity('person-a', 'person')],
    relations: [
      {
        id: 'r',
        source: 'person-a',
        target: 'paper-a',
        origin: 'model',
        status: 'rejected',
        type: 'uses',
        evidenceIds: [],
      },
    ],
  };
  assert.equal(entityConnections(dataset, 'person-a').papers.length, 0);
  assert.equal(entityConnections(dataset, 'person-a').relations.length, 1);
});
