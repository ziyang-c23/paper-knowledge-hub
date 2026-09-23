import { readFile } from 'node:fs/promises';
import {
  initializeWorkspace,
  readWorkspace,
  putRecord,
  backupWorkspace,
  restoreWorkspace,
  listBackups,
} from '../services/workspace-store.mjs';
const args = process.argv.slice(2),
  root = process.cwd(),
  command = args[0],
  write = args.includes('--write');
try {
  let result;
  if (command === 'init') result = await initializeWorkspace(root, { write });
  else if (command === 'status') {
    const s = await readWorkspace(root);
    result = {
      mode: 'local',
      revision: s.revision,
      updatedAt: s.updatedAt,
      counts: Object.fromEntries(
        Object.entries(s.dataset)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, v.length]),
      ),
    };
  } else if (command === 'backup') result = await backupWorkspace(root);
  else if (command === 'backups') result = await listBackups(root);
  else if (command === 'restore')
    result = await restoreWorkspace(root, {
      backupId: args[1],
      expectedRevision: args.includes('--revision')
        ? args[args.indexOf('--revision') + 1]
        : (await readWorkspace(root)).revision,
      write,
    });
  else if (command === 'put') {
    const record = JSON.parse(await readFile(args[1], 'utf8')),
      i = args.indexOf('--revision');
    if (write && i < 0)
      throw Error('--revision <hash> required for writes; get it with workspace status');
    result = await putRecord(root, {
      collection: args.includes('--collection') ? args[args.indexOf('--collection') + 1] : 'papers',
      record,
      expectedRevision: i >= 0 ? args[i + 1] : (await readWorkspace(root)).revision,
      write,
      publishConsent: args.includes('--publish-consent'),
    });
  } else
    throw Error(
      'Usage: workspace init [--write] | status | backup | backups | restore <id> [--write] | put <record.json> [--revision HASH --write --publish-consent --collection papers]',
    );
  const output = { ...result };
  if (output.dataset) {
    output.counts = Object.fromEntries(
      Object.entries(output.dataset)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, v.length]),
    );
    delete output.dataset;
  }
  console.log(JSON.stringify(output, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
