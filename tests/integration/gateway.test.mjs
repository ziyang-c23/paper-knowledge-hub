import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../../services/server.mjs';
import { generateAnswer, configuration } from '../../services/model-adapter.mjs';
import { emptyData } from '../../scripts/data.mjs';
const config = {
  configured: true,
  key: 'TEST_ONLY_KEY',
  baseURL: 'https://mock.example/v1',
  model: 'mock-contract-model',
};
const data = {
  ...emptyData(),
  papers: [
    {
      schemaVersion: 1,
      id: 'p',
      title: 'Memory',
      authors: [],
      year: 2026,
      url: 'https://example.org',
      visibility: 'public',
      privateNotes: 'PRIVATE_MARKER',
    },
  ],
  evidence: [
    {
      schemaVersion: 1,
      id: 'ev',
      paperId: 'p',
      kind: 'source',
      text: 'Memory stores context',
      status: 'verified',
      visibility: 'public',
    },
  ],
};
test('mocked adapter contract validates citations and rejects unsupported answer', async () => {
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'https://mock.example/v1/chat/completions');
    assert.equal(opts.headers.Authorization, 'Bearer TEST_ONLY_KEY');
    assert(!opts.body.includes('PRIVATE_MARKER'));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'Memory stores context [ev].' } }] }),
    );
  };
  const result = await generateAnswer({
    question: 'memory',
    evidence: data.evidence,
    config,
    fetchImpl,
  });
  assert.deepEqual(result.citations, ['ev']);
  await assert.rejects(
    () =>
      generateAnswer({
        question: 'memory',
        evidence: data.evidence,
        config,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Claim [invented].' } }] }),
          ),
      }),
    /unsupported citations/,
  );
  await assert.rejects(
    () => generateAnswer({ question: 'memory', evidence: [], config, fetchImpl }),
    /No verified public evidence/,
  );
});
test('gateway status, consent, no-evidence, errors, same origin and public-only payload (mock protocol)', async () => {
  let called = 0;
  const server = createGateway({
    data,
    dist: process.cwd(),
    config,
    fetchImpl: async (_url, opts) => {
      called++;
      assert(!opts.body.includes('PRIVATE_MARKER'));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Memory [ev]' } }] }));
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(base + '/api/status')).json(), { configured: true });
    const ask = async (input) =>
      fetch(base + '/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    assert.equal((await ask({ question: 'memory' })).status, 400);
    assert.equal((await ask({ question: 'absent', consent: true })).status, 422);
    const res = await ask({ question: 'memory', consent: true });
    assert.equal(res.status, 200);
    const value = await res.json();
    assert.equal(value.mode, 'live-model');
    assert(!JSON.stringify(value).includes('TEST_ONLY_KEY'));
    assert.equal(called, 1);
    assert.equal(
      (await fetch(base + '/api/status', { headers: { Origin: 'https://attacker.example' } }))
        .status,
      403,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('configuration status never implies tested connectivity', () => {
  assert.equal(configuration({}).configured, false);
  assert.equal(
    configuration({
      MODEL_API_KEY: 'k',
      MODEL_NAME: 'm',
      MODEL_BASE_URL: 'http://public.example/v1',
    }).configured,
    false,
  );
  assert.equal(
    configuration({
      MODEL_API_KEY: 'k',
      MODEL_NAME: 'm',
      MODEL_BASE_URL: 'https://service.example/v1',
    }).configured,
    true,
  );
});
test('mocked provider timeout and upstream rejection expose no raw provider body', async () => {
  await assert.rejects(
    () =>
      generateAnswer({
        question: 'memory',
        evidence: data.evidence,
        config,
        fetchImpl: async () => {
          throw new DOMException('sensitive internal payload', 'TimeoutError');
        },
      }),
    (e) => e.message === 'Model request timed out' && e.status === 502,
  );
  await assert.rejects(
    () =>
      generateAnswer({
        question: 'memory',
        evidence: data.evidence,
        config,
        fetchImpl: async () => new Response('SECRET_PROVIDER_BODY', { status: 401 }),
      }),
    (e) => e.message === 'Model service returned HTTP 401' && e.status === 502,
  );
  await assert.rejects(
    () =>
      generateAnswer({
        question: 'memory',
        evidence: data.evidence,
        config: { configured: false },
      }),
    (e) => e.status === 503,
  );
});
test('gateway preserves UI filter scope and rejects invalid filters before a provider call', async () => {
  const d = structuredClone(data);
  d.topics = [
    { schemaVersion: 1, id: 'topic-a', title: 'A', visibility: 'public' },
    { schemaVersion: 1, id: 'topic-b', title: 'B', visibility: 'public' },
  ];
  d.papers[0].topics = ['topic-a'];
  d.papers[0].status = 'unread';
  d.papers.push({ ...d.papers[0], id: 'p2', year: 2025, status: 'reviewed', topics: ['topic-b'] });
  d.evidence.push({ ...d.evidence[0], id: 'ev2', paperId: 'p2', text: 'Memory second paper' });
  let called = 0;
  const server = createGateway({
    data: d,
    dist: process.cwd(),
    config,
    fetchImpl: async (_url, opts) => {
      called++;
      const payload = JSON.parse(JSON.parse(opts.body).messages[1].content);
      assert.deepEqual(
        payload.evidence.map((e) => e.id),
        ['ev2'],
      );
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Second paper memory [ev2].' } }] }),
      );
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ask = (filters) =>
      fetch(base + '/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'memory', expand: true, consent: true, filters }),
      });
    for (const filters of [
      [],
      { topic: 123 },
      { topic: 'missing' },
      { year: {} },
      { year: '9999' },
      { status: 'invalid' },
      { relationType: 'invented' },
      { extra: 'x' },
    ])
      assert.equal((await ask(filters)).status, 400);
    assert.equal(called, 0);
    const response = await ask({
      topic: 'topic-b',
      year: '2025',
      status: 'reviewed',
      relationType: 'uses',
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.filters, {
      topic: 'topic-b',
      year: '2025',
      status: 'reviewed',
      relationType: 'uses',
    });
    assert.deepEqual(
      result.evidence.map((e) => e.id),
      ['ev2'],
    );
    assert.equal(called, 1);
    assert.equal((await ask({ topic: 'topic-b', year: 2025, status: 'unread' })).status, 422);
    assert.equal(called, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('citation validation rejects missing IDs and mixed valid/unknown IDs without fallback', async () => {
  for (const answer of ['Uncited claim.', 'Supported [ev]. Unsupported [not-supplied].'])
    await assert.rejects(
      () =>
        generateAnswer({
          question: 'memory',
          evidence: data.evidence,
          config,
          fetchImpl: async () =>
            new Response(JSON.stringify({ choices: [{ message: { content: answer } }] })),
        }),
      /missing or unsupported citations/,
    );
});
