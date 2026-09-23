import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  withWorkspaceLock,
  readWorkspace,
  commitWorkspace,
  requireRevision,
} from '../services/workspace-store.mjs';
import { processPDF, downloadPDF } from '../services/pdf.mjs';
const args = process.argv.slice(2),
  value = (key) => (args.includes(key) ? args[args.indexOf(key) + 1] : undefined);
const root = path.resolve(
  value('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
);
try {
  const paperId = args.includes('--paper') ? value('--paper') : null;
  if (!paperId || args.includes('--file') === args.includes('--url'))
    throw new Error(
      'Usage: node scripts/pdf.mjs --paper <id> (--file <path> | --url https://arxiv.org/pdf/<version>) [--root <library>] [--write]',
    );
  const store = await readWorkspace(root);
  if (!store.dataset.papers.some((p) => p.id === paperId))
    throw new Error(`Unknown paper ${paperId}; create its record first`);
  if (!args.includes('--write')) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          paperId,
          source: args.includes('--file') ? value('--file') : value('--url'),
          message: 'No file read/download/write performed. Add --write to import local PDF.',
        },
        null,
        2,
      ),
    );
  } else {
    const bytes = args.includes('--file')
      ? await fs.readFile(path.resolve(value('--file')))
      : await downloadPDF(value('--url'));
    const doc = await withWorkspaceLock(root, async () => {
      const current = await readWorkspace(root);
      requireRevision(current, value('--revision') || store.revision);
      const imported = await processPDF({
        root,
        paperId,
        bytes,
        filename: args.includes('--file') ? path.basename(value('--file')) : `${paperId}.pdf`,
      });
      await commitWorkspace(root, {
        ...current,
        documentIds: [...new Set([...(current.documentIds || []), imported.id])],
      });
      return imported;
    });
    console.log(
      JSON.stringify(
        {
          id: doc.id,
          paperId: doc.paperId,
          pageCount: doc.pageCount,
          sha256: doc.sha256,
          parser: doc.parser,
          quality: doc.quality,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
