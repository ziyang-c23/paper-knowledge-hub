import { saveDraft } from '../services/drafts.mjs';
import { readFile } from 'node:fs/promises';
import { readWorkspace, putRecord } from '../services/workspace-store.mjs';

const args = process.argv.slice(2),
  file = args[0],
  collectionIndex = args.indexOf('--collection'),
  collection = collectionIndex >= 0 ? args[collectionIndex + 1] : undefined,
  revisionIndex = args.indexOf('--revision'),
  expectedRevision = revisionIndex >= 0 ? args[revisionIndex + 1] : undefined,
  write = args.includes('--write'),
  createOnly = args.includes('--create-only');
try {
  if (!file || !collection)
    throw Error(
      'Usage: npm run ai:draft -- DRAFT.json --collection papers|topics|concepts|evidence|relations [--create-only --revision HASH --write]',
    );
  if (write && !expectedRevision) throw Error('--revision HASH is required for an apply');
  const raw = JSON.parse(await readFile(file, 'utf8')),
    record = raw.record && typeof raw.record === 'object' ? raw.record : raw,
    envelope = raw.record
      ? {
          sourceMaterial: raw.sourceMaterial || [],
          uncertainties: raw.uncertainties || [],
          candidateRelations: raw.candidateRelations || [],
        }
      : {};
  if (!record || Array.isArray(record)) throw Error('Draft record must be a JSON object');
  const current = await readWorkspace(process.cwd());
  if (args.includes('--stage')) {
    if (write) throw Error('--stage and --write are separate operations');
    const draft = await saveDraft(process.cwd(), {
      ...raw,
      record,
      collection,
      baseRevision: expectedRevision || current.revision,
      createOnly,
    });
    console.log(
      JSON.stringify(
        { mode: 'staged', id: draft.id, url: 'http://127.0.0.1:4176/#/drafts?id=' + draft.id },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const result = await putRecord(process.cwd(), {
    collection,
    record,
    expectedRevision: expectedRevision || current.revision,
    write,
    createOnly,
    publishConsent: args.includes('--publish-consent'),
  });
  console.log(
    JSON.stringify(
      {
        mode: write ? 'applied' : 'validated',
        collection,
        id: record.id,
        revision: result.revision || current.revision,
        envelope,
        ...(write
          ? {}
          : {
              nextStep:
                'Review the draft, then pass --revision REVISION --write only with explicit approval.',
            }),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
