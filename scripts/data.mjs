import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { normalizePaper } from '../src/lib/knowledge.mjs';
import { entityDimensions } from '../src/lib/entities.mjs';
export const collections = ['papers', 'topics', 'concepts', 'relations', 'evidence'];
const schema = JSON.parse(
  await readFile(new URL('../schemas/dataset.schema.json', import.meta.url), 'utf8'),
);
const check = new Ajv({ allErrors: true, strict: false }).compile(schema);
export function emptyData() {
  return { schemaVersion: 1, ...Object.fromEntries(collections.map((k) => [k, []])) };
}
export async function loadData(root) {
  const data = emptyData();
  for (const kind of collections) {
    const dir = path.join(root, 'content', kind);
    let files;
    try {
      files = await readdir(dir);
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    for (const file of files.sort())
      if (file.endsWith('.json')) {
        let item;
        try {
          item = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
        } catch (e) {
          throw Error(`${kind}/${file}: ${e.message}`);
        }
        if (item.id !== file.slice(0, -5))
          throw Error(`${kind}/${file}: filename must equal stable id`);
        if (item.visibility !== 'public')
          throw Error(`${kind}/${file}: private objects belong in private/content, not content`);
        if (item.privateNotes !== undefined && String(item.privateNotes).trim())
          throw Error(
            `${kind}/${file}: privateNotes must live in ignored private/, never public content`,
          );
        data[kind].push(item);
      }
  }
  return data;
}
export async function loadAuthoritativeData(root) {
  const { readWorkspace } = await import('../services/workspace-store.mjs');
  const store = await readWorkspace(root, { optional: true });
  return store ? store.dataset : loadData(root);
}
export const normalizeDOI = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '');
export const normalizeArxiv = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/arxiv\.org\/abs\//, '')
    .replace(/v\d+$/, '');
export function validateData(data) {
  const errors = [];
  if (!check(data))
    for (const e of check.errors)
      errors.push(
        `${e.instancePath || '/'} ${e.message}${e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`,
      );
  if (!data || collections.some((k) => !Array.isArray(data[k]))) return errors;
  const ids = new Map();
  for (const k of collections)
    for (const [i, x] of data[k].entries()) {
      if (!x || typeof x !== 'object') continue;
      if (ids.has(x.id)) errors.push(`${k}/${x.id}: duplicate global id (also ${ids.get(x.id)})`);
      ids.set(x.id, `${k}/${i}`);
    }
  const papers = new Set(data.papers.map((x) => x?.id)),
    topics = new Set(data.topics.map((x) => x?.id)),
    entities = new Set([...papers, ...topics, ...data.concepts.map((x) => x?.id)]),
    evidence = new Map(data.evidence.map((x) => [x?.id, x]));
  for (const p of data.papers) {
    if (!p) continue;
    for (const t of Array.isArray(p.topics) ? p.topics : [])
      if (!topics.has(t)) errors.push(`papers/${p.id}: unknown topic ${t}`);
    for (const [dimension, ids] of Object.entries(p.facets || {}))
      for (const id of Array.isArray(ids) ? ids : []) {
        const concept = data.concepts.find((c) => c.id === id);
        if (!concept || (concept.dimension && concept.dimension !== dimension))
          errors.push(`papers/${p.id}: invalid ${dimension} facet ${id}`);
      }
    for (const ids of Object.values(p.claimEvidence || {}))
      for (const id of Array.isArray(ids) ? ids : [])
        if (!evidence.has(id) || evidence.get(id).paperId !== p.id)
          errors.push(`papers/${p.id}: invalid claim evidence ${id}`);
  }
  for (const entity of data.concepts) {
    const allowedDimensions = entityDimensions[entity?.kind];
    if (
      entity?.dimension !== undefined &&
      Array.isArray(allowedDimensions) &&
      !allowedDimensions.includes(entity.dimension)
    )
      errors.push(
        `concepts/${entity.id}: dimension ${entity.dimension} is not valid for kind ${entity.kind}`,
      );
    for (const id of Array.isArray(entity?.relatedIds) ? entity.relatedIds : [])
      if (id === entity.id || !entities.has(id))
        errors.push(`concepts/${entity.id}: invalid related entity ${id}`);
  }
  for (const topic of data.topics) {
    if (!topic) continue;
    for (const id of Array.isArray(topic.compareIds) ? topic.compareIds : [])
      if (!papers.has(id)) errors.push(`topics/${topic.id}: unknown comparison paper ${id}`);
    for (const id of Array.isArray(topic.evidenceIds) ? topic.evidenceIds : [])
      if (!evidence.has(id)) errors.push(`topics/${topic.id}: unknown evidence ${id}`);
  }
  for (const field of ['doi', 'arxiv']) {
    const seen = new Map();
    for (const p of data.papers) {
      if (!p?.[field]) continue;
      const id = (field === 'doi' ? normalizeDOI : normalizeArxiv)(p[field]);
      if (seen.has(id)) errors.push(`papers/${p.id}: duplicate ${field} with ${seen.get(id)}`);
      else seen.set(id, p.id);
    }
  }
  for (const e of data.evidence) {
    if (!e) continue;
    if (!papers.has(e.paperId)) errors.push(`evidence/${e.id}: unknown paperId ${e.paperId}`);
    if (e.status === 'verified' && (e.kind === 'model' || e.kind === 'unverified'))
      errors.push(`evidence/${e.id}: model/unverified evidence cannot be verified`);
  }
  for (const r of data.relations) {
    if (!r) continue;
    for (const f of ['source', 'target'])
      if (!entities.has(r[f])) errors.push(`relations/${r.id}: unknown ${f} ${r[f]}`);
    for (const id of Array.isArray(r.evidenceIds) ? r.evidenceIds : [])
      if (!evidence.has(id)) errors.push(`relations/${r.id}: unknown evidence ${id}`);
    if (
      r.status === 'approved' &&
      (!Array.isArray(r.evidenceIds) ||
        !r.evidenceIds.length ||
        r.evidenceIds.some((id) => evidence.get(id)?.status !== 'verified'))
    )
      errors.push(`relations/${r.id}: approved relation requires verified evidence`);
    if (r.status === 'approved' && ['model', 'similarity'].includes(r.origin))
      errors.push(
        `relations/${r.id}: model/similarity candidates require curator review and origin before approval`,
      );
  }
  return errors;
}
const publicKeys = {
  paper:
    'schemaVersion id title year authors url visibility demo status topics tags aliases abstract note arxiv doi version updated acronym problem method assumptions inputs outputs data tasks evaluation limitations conclusions deployment memory worldModel platform facets claimEvidence visuals',
  topic:
    'schemaVersion id title visibility demo description dimensions branches questions boundaries analysis gaps evidenceIds compareIds comparisonQuestion',
  concept: 'schemaVersion id title kind visibility demo description aliases dimension',
  evidence: 'schemaVersion id visibility demo paperId kind text url locator status',
  relation: 'schemaVersion id visibility demo source target type evidenceIds origin status',
};
function pick(object, kind) {
  const keys = publicKeys[kind].split(' ');
  return Object.fromEntries(keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]]));
}
function arxivReference(paper) {
  const fromUrl = String(paper?.url || '').match(
    /^https:\/\/arxiv\.org\/(?:abs|pdf|html)\/(.+?)(?:\.pdf)?(?:[?#].*)?$/,
  )?.[1];
  const value = fromUrl || String(paper?.arxiv || '').replace(/^https:\/\/arxiv\.org\/abs\//, '');
  if (!/^(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/.test(value)) return null;
  const version = String(paper?.version || '');
  return /v\d+$/.test(value) || !/^v\d+$/.test(version) ? value : value + version;
}
function externalReference(paper, pdf = false) {
  const arxiv = arxivReference(paper);
  if (arxiv) return `https://arxiv.org/${pdf ? 'pdf' : 'abs'}/${arxiv}`;
  const doi = normalizeDOI(paper?.doi);
  if (/^10\.\d{4,9}\/[^\s?#]+$/i.test(doi)) return `https://doi.org/${doi}`;
  // Do not promote arbitrary URLs from a private record into public output.
  if (paper?.visibility === 'public' && /^https:\/\//.test(paper.url || '')) return paper.url;
  return null;
}

function publicText(value, data, publishedIds, owner) {
  const rewrite = (label, destination) => {
    const localDocument = destination.match(
      /^(?:\/api\/documents\/([^/?#]+)\/file|#\/document\/([^/?#]+))(?:\?([^#]*))?(?:#(.*))?$/,
    );
    if (localDocument) {
      const id = localDocument[1] || localDocument[2];
      const evidenceOwner = data.evidence.find((item) => item.documentId === id)?.paperId;
      const paper = evidenceOwner ? data.papers.find((item) => item.id === evidenceOwner) : owner;
      const external = externalReference(paper, true);
      const page = new URLSearchParams(localDocument[3] || localDocument[4]).get('page');
      const isPdf =
        external &&
        (/^https:\/\/arxiv\.org\/pdf\//.test(external) || /\.pdf(?:[?#]|$)/i.test(external));
      const target =
        external && external + (isPdf && /^[1-9]\d*$/.test(page || '') ? `#page=${page}` : '');
      const name = label
        .replace(/本地(?:完整)?\s*PDF/gi, isPdf ? '官方 PDF' : '外部原文')
        .replace(/本地原文/g, '外部原文');
      return target ? { label: name, target } : { label: `${name}（原文暂不可用）` };
    }
    const internal = destination.match(/^#\/(paper|topic|entities|concept)\/([^?#]+)(?:[?#].*)?$/);
    if (!internal || publishedIds.has(internal[2])) return { label, target: destination };
    const paper = internal[1] === 'paper' && data.papers.find((item) => item.id === internal[2]);
    const external = paper && externalReference(paper);
    return external
      ? { label: `${label}（外部参考）`, target: external }
      : { label: `${label}（未公开参考）` };
  };
  // Transform Markdown links, keeping code samples intact and never copying private prose.
  return String(value)
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, index) => {
      if (index % 2) return part;
      const references = new Map();
      part = part.replace(
        /^ {0,3}\[([^\]\n]+)\]:\s*<?((?:#\/(?:paper|topic|entities|concept|document)\/|\/api\/documents\/)[^\s>]+)>?(?:\s+"[^"\n]*")?\s*$/gm,
        (_match, id, destination) => {
          references.set(id.trim().toLowerCase(), destination);
          return '';
        },
      );
      part = part.replace(/(?<!!)\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?!\()/g, (match, label, id) => {
        const destination = references.get((id || label).trim().toLowerCase());
        return destination ? `[${label}](${destination})` : match;
      });
      return part.replace(
        /(?<!!)\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"\n]*")?\)/g,
        (_match, label, destination) => {
          const next = rewrite(label, destination);
          return next.target ? `[${next.label}](${next.target})` : next.label;
        },
      );
    })
    .join('');
}
export function publicProjection(data) {
  const out = emptyData();
  const publishedIds = new Set(
    [...data.papers, ...data.topics, ...data.concepts]
      .filter(
        (item) => item.visibility === 'public' && (!item.lifecycle || item.lifecycle === 'active'),
      )
      .map((item) => item.id),
  );
  for (const [collection, kind] of [
    ['papers', 'paper'],
    ['topics', 'topic'],
    ['concepts', 'concept'],
  ])
    out[collection] = data[collection]
      .filter((x) => x.visibility === 'public' && (!x.lifecycle || x.lifecycle === 'active'))
      .map((x) =>
        pick(
          collection === 'papers'
            ? normalizePaper(x)
            : collection === 'topics'
              ? {
                  description: '',
                  dimensions: [],
                  branches: [],
                  questions: [],
                  boundaries: '',
                  ...x,
                }
              : x,
          kind,
        ),
      );
  const topics = new Set(out.topics.map((x) => x.id));
  out.papers = out.papers.map((p) => ({ ...p, topics: p.topics.filter((id) => topics.has(id)) }));
  const papers = new Set(out.papers.map((x) => x.id)),
    entities = new Set([...papers, ...topics, ...out.concepts.map((x) => x.id)]);
  out.evidence = data.evidence
    .filter((x) => x.visibility === 'public' && papers.has(x.paperId))
    .map((x) => pick(x, 'evidence'));
  const evidence = new Set(out.evidence.map((x) => x.id));
  const concepts = new Set(out.concepts.map((x) => x.id));
  out.papers = out.papers.map((p) => ({
    ...p,
    ...(p.facets
      ? {
          facets: Object.fromEntries(
            Object.entries(p.facets).map(([k, ids]) => [k, ids.filter((id) => concepts.has(id))]),
          ),
        }
      : {}),
    ...(p.claimEvidence
      ? {
          claimEvidence: Object.fromEntries(
            Object.entries(p.claimEvidence).map(([k, ids]) => [
              k,
              ids.filter((id) => evidence.has(id)),
            ]),
          ),
        }
      : {}),
  }));
  out.topics = out.topics.map((t) => ({
    ...t,
    ...(t.evidenceIds ? { evidenceIds: t.evidenceIds.filter((id) => evidence.has(id)) } : {}),
    ...(t.compareIds ? { compareIds: t.compareIds.filter((id) => papers.has(id)) } : {}),
  }));
  out.relations = data.relations
    .filter(
      (x) =>
        x.visibility === 'public' &&
        entities.has(x.source) &&
        entities.has(x.target) &&
        (x.evidenceIds || []).every((id) => evidence.has(id)),
    )
    .map((x) => pick(x, 'relation'));
  for (const collection of ['papers', 'topics'])
    out[collection] = out[collection].map((record) => {
      const owner =
        collection === 'papers' ? data.papers.find((paper) => paper.id === record.id) : undefined;
      return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          key,
          typeof value === 'string'
            ? publicText(value, data, publishedIds, owner)
            : Array.isArray(value) && value.every((item) => typeof item === 'string')
              ? value.map((item) => publicText(item, data, publishedIds, owner))
              : value,
        ]),
      );
    });
  for (const k of collections) out[k].sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
export async function buildData(root) {
  const data = await loadAuthoritativeData(root),
    errors = validateData(data);
  if (errors.length) throw Error(errors.join('\n'));
  const result = publicProjection(data);
  const dir = path.join(root, 'src', 'generated');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'public.json');
  await writeFile(file + '.tmp', JSON.stringify(result, null, 2) + '\n');
  await rename(file + '.tmp', file);
  return result;
}
