import http from 'node:http';
import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadAuthoritativeData, validateData, publicProjection } from '../scripts/data.mjs';
import { retrieve } from '../src/lib/knowledge.mjs';
import { configuration, generateAnswer } from './model-adapter.mjs';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw Object.assign(Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(Error('Invalid JSON request'), { status: 400 });
  }
}
export function validateFilters(input, data) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Object.assign(Error('filters must be an object'), { status: 400 });
  const allowed = ['topic', 'year', 'status', 'relationType'];
  const out = {};
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key))
      throw Object.assign(Error(`Unknown filter: ${key}`), { status: 400 });
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'year') {
      if (
        !(
          (typeof value === 'number' && Number.isInteger(value)) ||
          (typeof value === 'string' && /^[0-9]{4}$/.test(value))
        ) ||
        !data.papers.some((p) => String(p.year) === String(value))
      )
        throw Object.assign(Error('year must be a year present in the public library'), {
          status: 400,
        });
      out.year = String(value);
    } else {
      if (typeof value !== 'string' || value.length > 120)
        throw Object.assign(Error(`${key} must be a string`), { status: 400 });
      const valid =
        key === 'topic'
          ? data.topics.some((t) => t.id === value)
          : key === 'status'
            ? ['unread', 'reading', 'reviewed'].includes(value)
            : ['studies', 'uses', 'extends', 'related', 'cites'].includes(value);
      if (!valid) throw Object.assign(Error(`Invalid ${key} selection`), { status: 400 });
      out[key] = value;
    }
  }
  return out;
}
export function createGateway({
  data,
  dist,
  config = configuration(),
  fetchImpl = fetch,
  timeoutMs = 20000,
} = {}) {
  const publicData = publicProjection(data);
  let active = 0;
  return http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
        return json(403, { error: 'Localhost host required' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        return json(403, { error: 'Same-origin requests required' });
      if (url.pathname === '/api/status' && req.method === 'GET')
        return json(200, { configured: config.configured });
      if (url.pathname === '/api/ask') {
        if (req.method !== 'POST') return json(405, { error: 'POST required' });
        if (!req.headers['content-type']?.startsWith('application/json'))
          return json(415, { error: 'application/json required' });
        const input = await body(req);
        if (!input || input.consent !== true)
          return json(400, {
            error:
              'Explicit consent is required to send public evidence to the configured model provider',
          });
        if (
          typeof input.question !== 'string' ||
          !input.question.trim() ||
          input.question.length > 2000 ||
          (input.expand !== undefined && typeof input.expand !== 'boolean')
        )
          return json(400, {
            error: 'Question must be 1–2000 characters and expand must be boolean',
          });
        const filters = validateFilters(input.filters, publicData);
        if (active >= 2) return json(429, { error: 'Model gateway is busy; retry later' });
        const retrieval = retrieve(publicData, input.question, {
            ...filters,
            expand: input.expand === true,
          }),
          evidence = retrieval.evidence
            .filter((e) => e.status === 'verified' && ['source', 'note'].includes(e.kind))
            .slice(0, 8)
            .map((e) => ({ ...e, text: e.text.slice(0, 4000) }));
        active++;
        try {
          const result = await generateAnswer({
            question: input.question,
            evidence,
            config,
            fetchImpl,
            timeoutMs,
          });
          return json(200, { ...result, evidence, filters, mode: 'live-model' });
        } finally {
          active--;
        }
      }
      if (url.pathname.startsWith('/api/')) return json(404, { error: 'Unknown API route' });
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'GET required' });
      let decoded;
      try {
        decoded = decodeURIComponent(url.pathname);
      } catch {
        return json(400, { error: 'Invalid path' });
      }
      const root = await realpath(dist),
        requested = path.resolve(root, '.' + decoded);
      if (!requested.startsWith(root + path.sep) && requested !== root)
        return json(403, { error: 'Invalid path' });
      let file;
      try {
        file = await realpath(requested === root ? path.join(root, 'index.html') : requested);
      } catch {
        return json(404, { error: 'File not found' });
      }
      if (!file.startsWith(root + path.sep)) return json(403, { error: 'Invalid path' });
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      json(e.status || 500, { error: e.status ? e.message : 'Gateway request failed' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd(),
      data = await loadAuthoritativeData(root),
      errors = validateData(data);
    if (errors.length) throw Error(errors.join('\n'));
    const port = Number(process.env.PORT || 4174);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw Error('PORT must be between 1024 and 65535');
    const server = createGateway({ data, dist: path.join(root, 'dist') });
    server.listen(port, '127.0.0.1', () =>
      console.log(
        `AI gateway: http://127.0.0.1:${port} (configured: ${configuration().configured}; public evidence only)`,
      ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
