import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, publicProjection } from '../../scripts/data.mjs';
import { retrieve, graphNeighborhood } from '../../src/lib/knowledge.mjs';
test('real seed OpenVLA example preserves basic hits and expands only approved paths', async (t) => {
  const d = publicProjection(await loadData(process.cwd()));
  if (!d.papers.some((p) => p.id === 'openvla')) {
    t.skip(
      'Optional original public template fixture is absent; synthetic retrieval tests remain active.',
    );
    return;
  }
  const basic = retrieve(d, 'OpenVLA'),
    expanded = retrieve(d, 'OpenVLA', { expand: true });
  assert.deepEqual(expanded.direct, basic.direct);
  assert.equal(basic.expanded.length, 0);
  const graph = graphNeighborhood(d, 'openvla', 2);
  for (const hit of expanded.expanded) {
    assert(graph.nodes.some((n) => n.id === hit.paperId));
    assert(graph.edges.some((r) => r.id === hit.relationId && r.status === 'approved'));
  }
  assert(!expanded.expanded.some((x) => x.paperId === 'voyager'));
  assert(basic.direct.some((x) => x.paperId === 'openvla'));
});
