import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initializeWorkspace,
  putRecord,
  readWorkspace,
  backupWorkspace,
  restoreWorkspace,
} from '../../services/workspace-store.mjs';
import { listAITasks, mutateAITask, getAITaskContext } from '../../services/ai-tasks.mjs';
import { applyDraft, listDrafts } from '../../services/drafts.mjs';
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pkh-ai-tasks-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let store = await initializeWorkspace(root, { write: true });
  for (const id of ['paper-a', 'paper-b'])
    store = await putRecord(root, {
      expectedRevision: store.revision,
      collection: 'papers',
      record: {
        schemaVersion: 1,
        id,
        title: id,
        year: 2024,
        authors: [],
        visibility: 'private',
        url: 'https://example.org/' + id,
        note: '## 论文概览\n\nOriginal overview\n\n## 方法\n\nOld mechanism\n\n## 附录\n\nKeep appendix\n',
        privateNotes: 'DO NOT EXPORT',
        personalAnalysis: 'PERSONAL THOUGHTS',
      },
    });
  store = await putRecord(root, {
    expectedRevision: store.revision,
    collection: 'topics',
    record: {
      schemaVersion: 1,
      id: 'topic-a',
      title: 'Topic',
      visibility: 'private',
      description: '',
      questions: [],
      dimensions: [],
      branches: [],
      boundaries: '',
    },
  });
  const action = (input) => mutateAITask(root, { expectedRevision: store.revision, ...input });
  return { root, store, action };
}
test('section task exports actual context, imports only selected chapter and applies via human-reviewed draft', async (t) => {
  const { root, store, action } = await fixture(t);
  const task = await action({
    action: 'create',
    type: 'section',
    paperIds: ['paper-a'],
    sectionId: 'mechanism',
  });
  assert.equal(task.status, 'queued');
  await assert.rejects(
    () => action({ action: 'prepare', id: task.id, expectedRevision: 'stale' }),
    (e) => e.status === 409,
  );
  assert.equal((await listAITasks(root))[0].status, 'failed');
  await action({ action: 'retry', id: task.id });
  const prepared = await action({ action: 'prepare', id: task.id });
  assert.equal(prepared.status, 'running');
  assert.ok(await readFile(path.join(root, prepared.contextFile)));
  const context = await getAITaskContext(root, task.id);
  assert.doesNotMatch(JSON.stringify(context), /DO NOT EXPORT|PERSONAL THOUGHTS|paper-b/);
  assert.equal(context.section.title, '方法');
  const imported = await action({
    action: 'import',
    id: task.id,
    result: { sectionText: 'New method with conditions.' },
  });
  assert.equal(imported.status, 'review');
  assert.equal((await readWorkspace(root)).revision, store.revision);
  const draft = (await listDrafts(root))[0];
  assert.ok(draft.record.note.includes('New method with conditions.'));
  assert.ok(draft.record.note.includes('Original overview'));
  assert.ok(draft.record.note.includes('Keep appendix'));
  assert.equal(draft.record.privateNotes, 'DO NOT EXPORT');
  // Ordinary inbox application must also update the task's effective status on reload.
  await applyDraft(root, {
    id: draft.id,
    expectedRevision: store.revision,
    acceptedFields: ['note'],
  });
  assert.equal((await listAITasks(root))[0].status, 'applied');
  assert.ok((await readWorkspace(root)).dataset.papers[0].note.includes('New method'));
});
test('experiment and comparison results route to their own fields without overwriting unrelated records', async (t) => {
  const { root, action } = await fixture(t);
  const experiments = await action({
    action: 'create',
    type: 'experiments',
    paperIds: ['paper-a'],
  });
  await action({ action: 'prepare', id: experiments.id });
  const item = {
    id: 'result-one',
    label: 'Test',
    task: 'Fixture task',
    metric: 'Success',
    unit: '%',
    trials: 'unknown',
    source: { url: 'https://example.org/source', locator: 'Table 1' },
    rows: [{ label: 'Policy', value: null }],
  };
  await action({ action: 'import', id: experiments.id, result: { experiments: [item] } });
  const compared = await action({
    action: 'create',
    type: 'compare',
    paperIds: ['paper-a', 'paper-b'],
    topicId: 'topic-a',
    question: 'How do mechanisms differ?',
  });
  await action({ action: 'prepare', id: compared.id });
  await action({
    action: 'import',
    id: compared.id,
    result: {
      analysis: 'Different controls; not directly comparable.',
      gaps: ['No matched control.'],
    },
  });
  const drafts = await listDrafts(root);
  assert.deepEqual(drafts.find((d) => d.collection === 'papers').record.visuals.experiments, [
    item,
  ]);
  assert.deepEqual(drafts.find((d) => d.collection === 'topics').record.compareIds, [
    'paper-a',
    'paper-b',
  ]);
  const outcome = await action({ action: 'apply', id: compared.id });
  assert.equal(outcome.status, 'applied');
  assert.equal(
    (await readWorkspace(root)).dataset.topics[0].analysis,
    'Different controls; not directly comparable.',
  );
});
test('stale result becomes recoverable failure and cancellation blocks its linked draft', async (t) => {
  const { root, store, action } = await fixture(t);
  const task = await action({
    action: 'create',
    type: 'section',
    paperIds: ['paper-a'],
    sectionId: 'mechanism',
  });
  await action({ action: 'prepare', id: task.id });
  const changed = await putRecord(root, {
    expectedRevision: store.revision,
    collection: 'papers',
    record: { ...store.dataset.papers[0], note: '## 方法\n\nLater human edit.' },
  });
  await assert.rejects(
    () =>
      action({
        action: 'import',
        id: task.id,
        expectedRevision: changed.revision,
        result: { sectionText: 'Old AI result' },
      }),
    (e) => e.status === 409,
  );
  assert.equal((await listAITasks(root))[0].status, 'failed');
  assert.equal((await listDrafts(root)).length, 0);
  await action({ action: 'retry', id: task.id, expectedRevision: changed.revision });
  await action({ action: 'prepare', id: task.id, expectedRevision: changed.revision });
  const reviewed = await action({
    action: 'import',
    id: task.id,
    expectedRevision: changed.revision,
    result: { sectionText: 'New result after refresh' },
  });
  await action({ action: 'cancel', id: task.id, expectedRevision: changed.revision });
  await assert.rejects(
    () => applyDraft(root, { id: reviewed.draftId, expectedRevision: changed.revision }),
    (e) => e.status === 409,
  );
  assert.ok((await readWorkspace(root)).dataset.papers[0].note.includes('Later human edit'));
});
test('tasks and local context files survive backup and restart without invoking a provider', async (t) => {
  const { root, store, action } = await fixture(t);
  const task = await action({
    action: 'create',
    type: 'section',
    paperIds: ['paper-a'],
    sectionId: 'mechanism',
  });
  await action({ action: 'prepare', id: task.id });
  const backup = await backupWorkspace(root);
  const manifest = JSON.parse(await readFile(path.join(backup.path, 'manifest.json'), 'utf8'));
  assert.equal(manifest.auxiliaryFiles.filter((f) => f.folder === 'ai-tasks').length, 2);
  await action({ action: 'cancel', id: task.id });
  await restoreWorkspace(root, {
    backupId: backup.backupId,
    expectedRevision: store.revision,
    write: true,
  });
  assert.equal((await listAITasks(root))[0].status, 'running');
  assert.equal((await getAITaskContext(root, task.id)).taskId, task.id);
});

test('local task API requires token and revision; exported context is accessible after prepare', async (t) => {
  const { createLocalServer } = await import('../../services/local-server.mjs');
  const { root, store } = await fixture(t);
  const server = createLocalServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = await fetch(base + '/api/workspace').then((r) => r.json());
  const input = {
    action: 'create',
    expectedRevision: store.revision,
    type: 'section',
    paperIds: ['paper-a'],
    sectionId: 'mechanism',
  };
  const post = (body, token = workspace.csrfToken) =>
    fetch(base + '/api/ai-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': token },
      body: JSON.stringify(body),
    });
  assert.equal((await post(input, '')).status, 403);
  assert.equal((await post({ ...input, expectedRevision: undefined })).status, 409);
  const created = await post(input).then((r) => r.json());
  assert.equal(created.status, 'queued');
  assert.equal(
    (await post({ action: 'prepare', id: created.id, expectedRevision: store.revision })).status,
    200,
  );
  const context = await fetch(base + '/api/ai-tasks/context?id=' + created.id).then((r) =>
    r.json(),
  );
  assert.equal(context.taskId, created.id);
  const listed = await fetch(base + '/api/ai-tasks').then((r) => r.json());
  assert.equal(listed.tasks[0].status, 'running');
});
