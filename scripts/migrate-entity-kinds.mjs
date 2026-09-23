import { readWorkspace, putRecord } from '../services/workspace-store.mjs';
import { validateData } from './data.mjs';

const root = process.cwd();
const write = process.argv.includes('--write');
const migrations = [
  { id: 'environment-widowx', from: 'concept', to: 'environment' },
  { id: 'task-robot-manipulation', from: 'concept', to: 'task' },
];

const current = await readWorkspace(root);
const planned = structuredClone(current.dataset);
const changes = [];
for (const migration of migrations) {
  const index = planned.concepts.findIndex((item) => item.id === migration.id);
  if (index < 0) {
    changes.push({ ...migration, status: 'missing' });
    continue;
  }
  const item = planned.concepts[index];
  if (item.kind === migration.to) {
    changes.push({ ...migration, status: 'already-migrated' });
    continue;
  }
  if (item.kind !== migration.from) {
    throw Error(`${migration.id}: expected kind=${migration.from}, found ${item.kind}`);
  }
  planned.concepts[index] = { ...item, kind: migration.to };
  changes.push({ ...migration, status: 'planned', visibility: item.visibility });
}

const errors = validateData(planned);
if (errors.length) throw Error(`Migration validation failed:\n${errors.join('\n')}`);

console.log(
  JSON.stringify(
    { mode: write ? 'write' : 'dry-run', baseRevision: current.revision, changes },
    null,
    2,
  ),
);
if (!write) process.exit(0);

let revision = current.revision;
const applied = [];
for (const migration of migrations) {
  const item = planned.concepts.find((entity) => entity.id === migration.id);
  const before = current.dataset.concepts.find((entity) => entity.id === migration.id);
  if (!item || item.kind === before?.kind) continue;
  const result = await putRecord(root, {
    collection: 'concepts',
    record: item,
    expectedRevision: revision,
    publishConsent: item.visibility === 'public',
    write: true,
  });
  revision = result.revision;
  applied.push({ id: item.id, from: before.kind, to: item.kind, revision });
}
console.log(JSON.stringify({ mode: 'written', applied, revision }, null, 2));
