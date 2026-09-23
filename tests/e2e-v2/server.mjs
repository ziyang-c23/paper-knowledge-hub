import { mkdtemp, cp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeWorkspace } from '../../services/workspace-store.mjs';
import { createLocalServer } from '../../services/local-server.mjs';
const source = process.cwd();
const root = await mkdtemp(path.join(os.tmpdir(), 'pkh-v2-browser-'));
try {
  await cp(path.join(source, 'content'), path.join(root, 'content'), { recursive: true });
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  await mkdir(path.join(root, 'content'), { recursive: true });
}
await initializeWorkspace(root, { write: true });
await mkdir(path.join(source, 'tmp/v2-review'), { recursive: true });
await writeFile(path.join(source, 'tmp/v2-review/runtime.json'), JSON.stringify({ root }));
const server = createLocalServer({
  root,
  dist: path.join(source, 'dist'),
  config: { configured: false },
});
server.listen(4177, '127.0.0.1');
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await rm(root, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
