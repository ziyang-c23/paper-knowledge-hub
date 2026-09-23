import { loadAuthoritativeData, validateData } from './data.mjs';
try {
  const d = await loadAuthoritativeData(process.cwd()),
    errors = validateData(d);
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`Valid schema v1: ${d.papers.length} papers; references and identities checked`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
