import { readFile, writeFile, mkdir, rm, link } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadData,
  validateData,
  emptyData,
  collections,
  normalizeDOI,
  normalizeArxiv,
} from './data.mjs';
import { normalizePaper } from '../src/lib/knowledge.mjs';
const canonical = (value) =>
  JSON.stringify(
    value && typeof value === 'object'
      ? Array.isArray(value)
        ? value.map((x) => JSON.parse(canonical(x)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, JSON.parse(canonical(value[k]))]),
          )
      : value,
  );
export async function importData(root, input, { write = false } = {}) {
  const { readWorkspace } = await import('../services/workspace-store.mjs');
  if (await readWorkspace(root, { optional: true }))
    return {
      mode: write ? 'write' : 'dry-run',
      additions: [],
      duplicates: [],
      conflicts: [],
      failures: [
        'Local workspace is authoritative. Use workspace put <record.json> --revision <hash> --write or the local editor; legacy public-content import is disabled.',
      ],
    };
  const existing = await loadData(root),
    bundle = input?.papers !== undefined ? input : { ...emptyData(), papers: [input] };
  const result = {
    mode: write ? 'write' : 'dry-run',
    additions: [],
    duplicates: [],
    conflicts: [],
    failures: [],
  };
  if (!bundle || collections.some((k) => !Array.isArray(bundle[k]))) {
    result.failures.push('Expected dataset bundle with all collections, or a single paper');
    return result;
  }
  if (bundle.schemaVersion !== 1) {
    result.failures.push('Unsupported bundle schemaVersion; expected 1');
    return result;
  }
  const unknown = Object.keys(bundle).filter(
    (k) => k !== 'schemaVersion' && !collections.includes(k),
  );
  if (unknown.length) {
    result.failures.push(`Unknown bundle fields: ${unknown.join(', ')}`);
    return result;
  }
  const additions = [];
  const merged = structuredClone(existing);
  for (const kind of collections)
    for (const incoming of bundle[kind]) {
      if (!incoming || typeof incoming !== 'object') {
        result.failures.push(`${kind}: invalid object`);
        continue;
      }
      if (incoming.visibility !== 'public') {
        result.failures.push(
          `${kind}/${incoming.id}: import to public content requires visibility public`,
        );
        continue;
      }
      if (incoming.privateNotes !== undefined && String(incoming.privateNotes).trim()) {
        result.failures.push(
          `${kind}/${incoming.id}: privateNotes must live in ignored private/, never public content`,
        );
        continue;
      }
      const found = collections
        .flatMap((k) => existing[k].map((x) => ({ kind: k, item: x })))
        .find((x) => x.item.id === incoming.id);
      if (found) {
        const normalized = (v) => (kind === 'papers' ? normalizePaper(v) : v);
        if (
          found.kind === kind &&
          canonical(normalized(found.item)) === canonical(normalized(incoming))
        )
          result.duplicates.push(`${kind}/${incoming.id}`);
        else
          result.conflicts.push(
            `${kind}/${incoming.id}: existing stable id differs; edit canonical file intentionally`,
          );
        continue;
      }
      if (kind === 'papers') {
        const collision = existing.papers.find(
          (p) =>
            (p.doi && incoming.doi && normalizeDOI(p.doi) === normalizeDOI(incoming.doi)) ||
            (p.arxiv &&
              incoming.arxiv &&
              normalizeArxiv(p.arxiv) === normalizeArxiv(incoming.arxiv)),
        );
        if (collision) {
          result.conflicts.push(`${kind}/${incoming.id}: same DOI/arXiv as ${collision.id}`);
          continue;
        }
      }
      additions.push({ kind, item: incoming });
      merged[kind].push(incoming);
      result.additions.push(`${kind}/${incoming.id}`);
    }
  result.failures.push(...validateData(merged));
  if (!write || result.failures.length || result.conflicts.length) return result;
  // Validate the whole transaction first. Publish with hard links, which never overwrite;
  // roll back every newly published file if any operation fails.
  const stage = path.join(root, `tmp/import-${process.pid}-${Date.now()}`),
    published = [];
  try {
    await mkdir(stage, { recursive: true });
    for (const { kind, item } of additions) {
      await mkdir(path.join(root, 'content', kind), { recursive: true });
      const staged = path.join(stage, `${kind}-${item.id}.json`);
      await writeFile(staged, JSON.stringify(item, null, 2) + '\n', { flag: 'wx' });
      const dest = path.join(root, 'content', kind, `${item.id}.json`);
      await link(staged, dest);
      published.push(dest);
    }
  } catch (e) {
    for (const dest of published) await rm(dest);
    result.failures.push(`Transaction rolled back: ${e.message}`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2),
      file = args.find((x) => !x.startsWith('--'));
    if (!file) throw Error('Usage: npm run import -- input.json [--write] (default: dry run)');
    const result = await importData(process.cwd(), JSON.parse(await readFile(file, 'utf8')), {
      write: args.includes('--write'),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.conflicts.length || result.failures.length) process.exitCode = 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
