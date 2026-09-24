/** Authenticated, read-only deployment surface. Never forwards requests to the local writer. */
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readWorkspace, safePrivate } from './workspace-store.mjs';
import { listDocuments } from './pdf.mjs';
import { readReadingRecords, listReadingRecords } from './reading-records.mjs';
import { defaultDatabase } from '../src/lib/database.mjs';
import { enhancedSearch } from '../src/lib/search-v2.mjs';

const scrypt = promisify(scryptCallback);
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

export async function hashPrivatePassword(password) {
  if (typeof password !== 'string' || password.length < 16)
    throw Error('Use a password with at least 16 characters');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}

export function privateConfiguration(env = process.env) {
  const origin = env.PKH_PRIVATE_ORIGIN;
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw Error('PKH_PRIVATE_ORIGIN must be an explicit origin');
  }
  if (url.origin !== origin || url.username || url.password)
    throw Error('Use an origin without path or credentials');
  const development = env.PKH_PRIVATE_LOOPBACK_HTTP === '1';
  if (
    development
      ? !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
      : url.protocol !== 'https:'
  )
    throw Error('HTTPS required; HTTP is allowed only for explicit loopback development');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(env.PKH_PRIVATE_USER || ''))
    throw Error('Set PKH_PRIVATE_USER');
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.PKH_PRIVATE_PASSWORD_HASH || ''))
    throw Error('Set a valid PKH_PRIVATE_PASSWORD_HASH');
  return {
    origin,
    username: env.PKH_PRIVATE_USER,
    passwordHash: env.PKH_PRIVATE_PASSWORD_HASH,
    development,
  };
}

// Existing list helpers create missing directories; deployment reads must never do so.
async function readCollection(root, collection) {
  const dir = path.join(await safePrivate(root), collection);
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return (
    await Promise.all(
      names
        .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
        .map(async (name) => JSON.parse(await readFile(path.join(dir, name), 'utf8'))),
    )
  ).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
async function readTaskContext(root, id) {
  if (!/^[a-f0-9-]{36}$/.test(id || '')) throw fail('Invalid task ID');
  const dir = path.join(await safePrivate(root), 'ai-tasks');
  const task = JSON.parse(await readFile(path.join(dir, id + '.json'), 'utf8'));
  if (!task.contextFile) throw fail('Task context is not prepared', 404);
  return JSON.parse(await readFile(path.join(dir, id + '.context.json'), 'utf8'));
}

export function createPrivateServer({
  root,
  dist = path.join(root, 'dist'),
  config = privateConfiguration(),
} = {}) {
  // Validate injected configurations too; tests and embedders cannot accidentally bypass TLS policy.
  config = privateConfiguration({
    PKH_PRIVATE_ORIGIN: config.origin,
    PKH_PRIVATE_USER: config.username,
    PKH_PRIVATE_PASSWORD_HASH: config.passwordHash,
    PKH_PRIVATE_LOOPBACK_HTTP: config.development ? '1' : '0',
  });
  const origin = new URL(config.origin);
  let validCredentialDigest,
    activeChecks = 0,
    failures = 0,
    failureWindow = Date.now();
  async function authenticate(header) {
    if (
      typeof header !== 'string' ||
      header.length > 2048 ||
      !/^Basic [A-Za-z0-9+/]+=*$/.test(header)
    )
      return false;
    const digest = createHash('sha256').update(header).digest();
    if (validCredentialDigest && timingSafeEqual(digest, validCredentialDigest)) return true;
    if (Date.now() - failureWindow > 60000) {
      failures = 0;
      failureWindow = Date.now();
    }
    if (failures >= 30 || activeChecks >= 4)
      throw fail('Authentication temporarily rate limited', 429);
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    const [, salt, expected] = config.passwordHash.split(':');
    activeChecks++;
    try {
      const derived = await scrypt(decoded.slice(colon + 1), salt, 64);
      const valid =
        timingSafeEqual(derived, Buffer.from(expected, 'hex')) &&
        decoded.slice(0, colon) === config.username;
      if (valid) validCredentialDigest = digest;
      else failures++;
      return valid;
    } finally {
      activeChecks--;
    }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value));
    };
    try {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
        throw fail('Loopback reverse proxy required', 403);
      if (req.headers.host !== origin.host) throw fail('Configured Host required', 403);
      if (!config.development && req.headers['x-forwarded-proto'] !== 'https')
        throw fail('HTTPS reverse proxy required', 403);
      if (req.headers.origin && req.headers.origin !== config.origin)
        throw fail('Same-origin request required', 403);
      if (
        req.headers['sec-fetch-site'] &&
        !['none', 'same-origin'].includes(req.headers['sec-fetch-site'])
      )
        throw fail('Cross-site requests blocked', 403);
      if (!(await authenticate(req.headers.authorization))) {
        res.setHeader(
          'WWW-Authenticate',
          'Basic realm="Private research workspace", charset="UTF-8"',
        );
        return json(401, { error: 'Authentication required' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        throw fail('Private workspace is read-only', 405);
      }
      const url = new URL(req.url, config.origin);
      const p = url.pathname;
      if (p === '/api/status')
        return json(200, {
          mode: 'private-web',
          readOnly: true,
          configured: false,
          authState: 'authenticated',
          dataScope: 'private',
          modelScope: 'disabled',
        });
      if (p === '/api/workspace' || p === '/api/retrieval') {
        const store = await readWorkspace(root);
        const documents = (await listDocuments(root)).filter((d) =>
          store.documentIds?.includes(d.id),
        );
        const dataset = { ...store.dataset, scope: 'local' };
        const readingRecords = await listReadingRecords(root, store);
        if (p === '/api/retrieval')
          return json(
            200,
            enhancedSearch(dataset, url.searchParams.get('q') || '', {
              ...Object.fromEntries(url.searchParams),
              documents,
              readingRecords,
            }),
          );
        return json(200, {
          mode: 'private-web',
          readOnly: true,
          storageMode: 'private-web',
          dataScope: 'private',
          authState: 'authenticated',
          syncState: 'snapshot',
          capabilities: { write: false, model: false },
          revision: store.revision,
          dataset,
          database: store.database || defaultDatabase(),
          documents,
          readingRecords,
        });
      }
      if (p === '/api/reading-records')
        return json(200, await readReadingRecords(root, url.searchParams.get('paperId')));
      if (p === '/api/drafts')
        return json(200, { drafts: await readCollection(root, 'draft-inbox') });
      if (p === '/api/ai-tasks')
        return json(200, { tasks: await readCollection(root, 'ai-tasks') });
      if (p === '/api/ai-tasks/context')
        return json(200, await readTaskContext(root, url.searchParams.get('id')));
      const document = p.match(/^\/api\/documents\/(doc-[a-f0-9]{32})\/file$/);
      if (document) {
        const store = await readWorkspace(root);
        if (!store.documentIds?.includes(document[1])) throw fail('Document not found', 404);
        const bytes = await readFile(
          path.join(await safePrivate(root), 'documents', document[1] + '.pdf'),
        );
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="document.pdf"',
          'Content-Length': bytes.length,
        });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      if (p.startsWith('/api/')) throw fail('Unknown read-only API route', 404);
      const webroot = await realpath(dist);
      let decoded;
      try {
        decoded = decodeURIComponent(p);
      } catch {
        throw fail('Invalid path');
      }
      const candidate = path.resolve(webroot, '.' + decoded);
      if (candidate !== webroot && !candidate.startsWith(webroot + path.sep))
        throw fail('Invalid path', 403);
      const file = await realpath(
        candidate === webroot ? path.join(webroot, 'index.html') : candidate,
      );
      if (!file.startsWith(webroot + path.sep) || !(await stat(file)).isFile())
        throw fail('Invalid file', 403);
      let bytes = await readFile(file);
      if (file === path.join(webroot, 'index.html'))
        bytes = Buffer.from(
          bytes
            .toString()
            .replace(
              '<head>',
              '<head><script>window.__PKH_LOCAL__=true;window.__PKH_PRIVATE_WEB__=true;</script>',
            ),
        );
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      json(error.status || (error.code === 'ENOENT' ? 404 : 500), {
        error: error.status ? error.message : 'Private workspace request failed',
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = privateConfiguration();
  const port = Number(process.env.PKH_PRIVATE_PORT || 4177);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('PKH_PRIVATE_PORT must be 1024–65535');
  const root = process.env.PKH_PRIVATE_DATA_ROOT || process.cwd();
  await readWorkspace(root);
  createPrivateServer({ root, dist: path.resolve('dist'), config }).listen(port, '127.0.0.1', () =>
    console.log(
      `Private read-only workspace listening on loopback:${port}; external origin: ${config.origin}`,
    ),
  );
}
