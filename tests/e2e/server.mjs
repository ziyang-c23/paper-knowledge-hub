import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist'),
  prefix = '/paper-knowledge-hub';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith(prefix + '/')) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const name = decodeURIComponent(url.pathname.slice(prefix.length)),
        file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      const b = await readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      });
      res.end(b);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(4175, '127.0.0.1');
