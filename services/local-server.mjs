import { listAITasks, mutateAITask, getAITaskContext } from './ai-tasks.mjs';
import { readReadingRecords, saveReadingRecords } from './reading-records.mjs';
import { listDrafts, saveDraft, applyDraft } from './drafts.mjs';
import http from 'node:http';
import path from 'node:path';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  readWorkspace,
  putRecord,
  backupWorkspace,
  restoreWorkspace,
  listBackups,
  withWorkspaceLock,
  requireRevision,
  commitWorkspace,
  listHistory,
  readHistory,
  safePrivate,
} from './workspace-store.mjs';
import { defaultDatabase } from '../src/lib/database.mjs';
import { saveDatabase, patchPapers } from './database-store.mjs';
import { configuration } from './model-adapter.mjs';
import { createGateway } from './server.mjs';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};
const error = (message, status = 400) => Object.assign(Error(message), { status });
async function body(req, limit = 2 * 1024 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw error('application/json required', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw error('Request too large', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error();
    return value;
  } catch {
    throw error('Invalid JSON object');
  }
}
async function documents(root, store) {
  const { listDocuments } = await import('./pdf.mjs');
  return (await listDocuments(root)).filter((doc) => (store.documentIds || []).includes(doc.id));
}
export function createLocalServer({
  root,
  dist = path.join(root, 'dist'),
  config = configuration(),
  fetchImpl = fetch,
} = {}) {
  const csrfToken = randomBytes(32).toString('hex');
  let activeModelRequests = 0;
  return http.createServer(async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host || '',
        url = new URL(req.url, 'http://localhost');
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
        throw error('Loopback Host required', 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw error('Same-origin request required', 403);
      if (
        req.headers['sec-fetch-site'] &&
        !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])
      )
        throw error('Cross-site requests blocked', 403);
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) throw error('Method not allowed', 405);
      if (req.method === 'POST') {
        const token = String(req.headers['x-workspace-token'] || '');
        if (
          token.length !== csrfToken.length ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(csrfToken))
        )
          throw error('Valid X-Workspace-Token required', 403);
      }
      if (url.pathname === '/api/ai-tasks' && req.method === 'GET')
        return json(200, { tasks: await listAITasks(root) });
      if (url.pathname === '/api/ai-tasks' && req.method === 'POST')
        return json(200, await mutateAITask(root, await body(req)));
      if (url.pathname === '/api/ai-tasks/context' && req.method === 'GET')
        return json(200, await getAITaskContext(root, url.searchParams.get('id')));
      if (url.pathname === '/api/reading-records' && req.method === 'GET')
        return json(200, await readReadingRecords(root, url.searchParams.get('paperId')));
      if (url.pathname === '/api/reading-records' && req.method === 'POST')
        return json(200, await saveReadingRecords(root, await body(req)));
      if (url.pathname === '/api/drafts' && req.method === 'GET')
        return json(200, { drafts: await listDrafts(root) });
      if (url.pathname === '/api/drafts' && req.method === 'POST')
        return json(200, await saveDraft(root, await body(req)));
      if (url.pathname === '/api/drafts/apply' && req.method === 'POST')
        return json(200, await applyDraft(root, await body(req)));
      if (url.pathname === '/api/status' && req.method === 'GET')
        return json(200, {
          mode: 'local',
          configured: config.configured,
          modelScope: 'public-only',
        });
      if (url.pathname === '/api/workspace' && req.method === 'GET') {
        const store = await readWorkspace(root);
        return json(200, {
          mode: 'local',
          revision: store.revision,
          dataset: { ...store.dataset, scope: 'local' },
          csrfToken,
          database: store.database || defaultDatabase(),
          documents: await documents(root, store),
        });
      }
      if (['/api/database', '/api/papers/batch'].includes(url.pathname) && req.method === 'POST') {
        const operation = url.pathname === '/api/database' ? saveDatabase : patchPapers;
        const store = await operation(root, await body(req));
        return json(200, { revision: store.revision });
      }
      if (url.pathname === '/api/records' && req.method === 'POST') {
        const store = await putRecord(root, await body(req));
        return json(200, {
          revision: store.revision,
          dataset: { ...store.dataset, scope: 'local' },
        });
      }
      if (url.pathname === '/api/backup' && req.method === 'POST') {
        await body(req);
        return json(200, await backupWorkspace(root));
      }
      if (url.pathname === '/api/backups' && req.method === 'GET')
        return json(200, { backups: await listBackups(root) });
      if (url.pathname === '/api/history' && req.method === 'GET')
        return json(200, { history: await listHistory(root) });
      const historyMatch = url.pathname.match(/^\/api\/history\/([a-f0-9]{64})$/);
      if (historyMatch && req.method === 'GET')
        return json(200, await readHistory(root, historyMatch[1]));
      if (url.pathname === '/api/restore' && req.method === 'POST') {
        const input = await body(req),
          store = await restoreWorkspace(root, { ...input, write: true });
        return json(200, {
          revision: store.revision,
          dataset: { ...store.dataset, scope: 'local' },
          documents: await documents(root, store),
          safetyBackup: store.safetyBackup,
        });
      }
      if (url.pathname === '/api/documents/import' && req.method === 'POST') {
        const input = await body(req, 36 * 1024 * 1024);
        if (typeof input.pdfBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.pdfBase64))
          throw error('Valid PDF base64 required');
        const bytes = Buffer.from(input.pdfBase64, 'base64');
        if (bytes.length > 25 * 1024 * 1024) throw error('PDF exceeds 25 MB', 413);
        const result = await withWorkspaceLock(root, async () => {
          const store = await readWorkspace(root);
          requireRevision(store, input.expectedRevision);
          if (!store.dataset.papers.some((p) => p.id === input.paperId))
            throw error('Unknown paper ID');
          const { processPDF } = await import('./pdf.mjs');
          const document = await processPDF({
            root,
            paperId: input.paperId,
            bytes,
            filename: input.filename,
          });
          const next = await commitWorkspace(root, {
            ...store,
            documentIds: [...new Set([...(store.documentIds || []), document.id])],
          });
          return { document, revision: next.revision };
        });
        return json(200, result);
      }
      const fileMatch = url.pathname.match(/^\/api\/documents\/(doc-[a-f0-9]+)\/file$/);
      if (fileMatch && req.method === 'GET') {
        const store = await readWorkspace(root),
          id = fileMatch[1];
        if (!(store.documentIds || []).includes(id)) throw error('Document not found', 404);
        const dir = await safePrivate(root),
          bytes = await readFile(path.join(dir, 'documents', id + '.pdf'));
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline; filename="document.pdf"',
          'Referrer-Policy': 'no-referrer',
        });
        return res.end(bytes);
      }
      if (url.pathname === '/api/retrieval' && req.method === 'GET') {
        const store = await readWorkspace(root),
          { enhancedSearch } = await import('../src/lib/search-v2.mjs');
        return json(
          200,
          enhancedSearch({ ...store.dataset, scope: 'local' }, url.searchParams.get('q') || '', {
            ...Object.fromEntries(url.searchParams),
            documents: await documents(root, store),
          }),
        );
      }
      if (url.pathname === '/api/ask' && req.method === 'POST') {
        if (activeModelRequests >= 2) throw error('Model gateway is busy; retry later', 429);
        const store = await readWorkspace(root);
        const gateway = createGateway({ data: store.dataset, dist, config, fetchImpl });
        activeModelRequests++;
        res.once('close', () => {
          activeModelRequests--;
        });
        gateway.emit('request', req, res);
        return;
      }
      if (url.pathname.startsWith('/api/')) throw error('Unknown API route', 404);
      if (!['GET', 'HEAD'].includes(req.method)) throw error('GET required', 405);
      const webroot = await realpath(dist);
      let decoded;
      try {
        decoded = decodeURIComponent(url.pathname);
      } catch {
        throw error('Invalid path');
      }
      const requested = path.resolve(webroot, '.' + decoded);
      if (requested !== webroot && !requested.startsWith(webroot + path.sep))
        throw error('Invalid path', 403);
      let file;
      try {
        file = await realpath(requested === webroot ? path.join(webroot, 'index.html') : requested);
      } catch {
        throw error('File not found. Run npm run build first.', 404);
      }
      if (!file.startsWith(webroot + path.sep) || !(await lstat(file)).isFile())
        throw error('Invalid file', 403);
      let bytes = await readFile(file);
      if (path.basename(file) === 'index.html')
        bytes = Buffer.from(
          bytes.toString().replace('<head>', '<head><script>window.__PKH_LOCAL__=true</script>'),
        );
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      if (!res.headersSent)
        json(e.status || 500, {
          error: e.status ? e.message : 'Local workspace request failed',
          ...(e.details ? { details: e.details } : {}),
        });
      else res.end();
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd(),
    port = Number(process.env.PORT || 4176);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('PORT must be 1024–65535');
  await readWorkspace(root);
  createLocalServer({ root }).listen(port, '127.0.0.1', () =>
    console.log(`Local workspace: http://127.0.0.1:${port} (private storage; model public-only)`),
  );
}
