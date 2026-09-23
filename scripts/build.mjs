import { buildData } from './data.mjs';
try {
  const d = await buildData(process.cwd());
  console.log(`Built public data: ${d.papers.length} papers, ${d.relations.length} relations`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
