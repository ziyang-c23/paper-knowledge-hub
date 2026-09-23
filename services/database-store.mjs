import {
  readWorkspace,
  withWorkspaceLock,
  requireRevision,
  commitWorkspace,
} from './workspace-store.mjs';
import { defaultDatabase, validateDatabase } from '../src/lib/database.mjs';
const fail = (message, status = 422) => Object.assign(Error(message), { status });
export async function saveDatabase(root, { database, expectedRevision }) {
  return withWorkspaceLock(root, async () => {
    const current = await readWorkspace(root);
    requireRevision(current, expectedRevision);
    const errors = validateDatabase(database, current.dataset);
    if (errors.length) throw fail(errors.join('; '));
    const previous = current.database || defaultDatabase();
    // Property IDs carry meaning across every record. Type changes need an explicit migration.
    for (const old of previous.properties) {
      const next = database?.properties?.find((p) => p.id === old.id);
      if (next && next.type !== old.type)
        throw fail('Property type changes require a migration; add a new property instead.');
    }
    return commitWorkspace(root, { ...current, database });
  });
}
export async function patchPapers(root, { changes, expectedRevision, publishConsent = false }) {
  return withWorkspaceLock(root, async () => {
    const current = await readWorkspace(root);
    requireRevision(current, expectedRevision);
    if (
      !Array.isArray(changes) ||
      !changes.length ||
      changes.length > 1000 ||
      new Set(changes.map((c) => c?.id)).size !== changes.length
    )
      throw fail('Provide 1–1000 unique paper changes');
    const next = structuredClone(current);
    const allowed = new Set(['year', 'status', 'lifecycle', 'topics', 'tags', 'customProperties']);
    for (const change of changes) {
      const paper = next.dataset.papers.find((p) => p.id === change?.id);
      if (!paper) throw fail('Unknown paper ID', 404);
      if (
        !change.changes ||
        typeof change.changes !== 'object' ||
        Array.isArray(change.changes) ||
        !Object.keys(change.changes).length ||
        Object.keys(change.changes).some((k) => !allowed.has(k))
      )
        throw fail('Unsupported paper patch');
      if (paper.visibility === 'public' && publishConsent !== true)
        throw fail('Explicit publishConsent is required to change a public record', 403);
      for (const [key, value] of Object.entries(change.changes)) {
        if (key === 'customProperties') {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw fail('Invalid custom property patch');
          paper.customProperties = { ...paper.customProperties };
          for (const [property, v] of Object.entries(value)) {
            if (!next.database?.properties.some((p) => p.id === property))
              throw fail('Unknown custom property');
            if (v === null) delete paper.customProperties[property];
            else paper.customProperties[property] = v;
          }
        } else if (value === null) delete paper[key];
        else paper[key] = value;
      }
      paper.updated = new Date().toISOString().slice(0, 10);
    }
    return commitWorkspace(root, next);
  });
}
