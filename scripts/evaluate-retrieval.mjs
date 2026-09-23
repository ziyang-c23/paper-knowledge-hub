import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadData } from './data.mjs';
import { retrieve } from '../src/lib/knowledge.mjs';
import { enhancedSearch } from '../src/lib/search-v2.mjs';
import { listDocuments } from '../services/pdf.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = await loadData(root),
  documents = (await listDocuments(root)).filter((x) =>
    [
      '353c37df34458f12f969b14dfd8b77175b727b9cddea7bb891759beddeefe1be',
      '73bff297cfafe523319162124e6b7f96919c0930e0a380f307255c4c7464ac93',
    ].includes(x.sha256),
  );
if (documents.length !== 2)
  throw new Error(
    'This fixed evaluation needs the exact OpenVLA v3 and Octo v2 PDFs documented in docs/fulltext-verification.md',
  );
const suite = JSON.parse(
  await fs.readFile(path.join(root, 'tests', 'fixtures', 'retrieval-queries.json'), 'utf8'),
);
const results = [];
for (const q of suite.queries)
  for (const strategy of ['v1', 'baseline', 'graph', 'ranked']) {
    const start = performance.now();
    const result =
      strategy === 'v1'
        ? retrieve(data, q.query, { expand: false })
        : enhancedSearch({ ...data, scope: 'local' }, q.query, {
            strategy,
            scope: q.scope,
            documents,
          });
    const elapsedMs = performance.now() - start;
    const top = result.direct.slice(0, 5),
      negative = !q.acceptable.length;
    const hit = negative
      ? result.direct.length === 0 && result.expanded.length === 0
      : top.some((x) =>
          q.acceptable.some((y) => x.paperId === y.paperId && x.pageIndex === y.pageIndex),
        );
    results.push({
      id: q.id,
      split: q.split,
      strategy,
      query: q.query,
      scope: q.scope,
      hit,
      negative,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      directCount: result.direct.length,
      expandedCount: result.expanded.length,
      top5: top.map((x) => ({
        paperId: x.paperId,
        ...(x.pageIndex ? { pageIndex: x.pageIndex } : {}),
        sourceType: x.sourceType || 'v1-unspecified',
      })),
    });
  }
const summary = [];
for (const split of ['dev', 'heldout', 'final'])
  for (const strategy of ['v1', 'baseline', 'graph', 'ranked']) {
    const rows = results.filter((x) => x.split === split && x.strategy === strategy),
      positives = rows.filter((x) => !x.negative),
      negatives = rows.filter((x) => x.negative);
    summary.push({
      split,
      strategy,
      pageHitAt5: `${positives.filter((x) => x.hit).length}/${positives.length}`,
      absentLiteralCorrect: `${negatives.filter((x) => x.hit).length}/${negatives.length}`,
      milliseconds: Number(rows.reduce((n, x) => n + x.elapsedMs, 0).toFixed(3)),
    });
  }
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      documents: documents.map((d) => ({
        paperId: d.paperId,
        sha256: d.sha256,
        pageCount: d.pageCount,
      })),
      summary,
      results,
    },
    null,
    2,
  ),
);
