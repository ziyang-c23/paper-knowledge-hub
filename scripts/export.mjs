import { writeFile } from 'node:fs/promises';
import { loadAuthoritativeData, validateData, publicProjection } from './data.mjs';
import { comparisonMarkdown, awesomeMarkdown } from '../src/lib/knowledge.mjs';
try {
  const args = process.argv.slice(2),
    arg = (k) => args[args.indexOf(k) + 1],
    raw = await loadAuthoritativeData(process.cwd()),
    errors = validateData(raw);
  if (errors.length) throw Error(errors.join('\n'));
  const data = publicProjection(raw),
    format = args.includes('--format') ? arg('--format') : 'markdown',
    ids = args.includes('--ids') ? arg('--ids').split(',') : null;
  let output;
  if (format === 'json') output = JSON.stringify(data, null, 2) + '\n';
  else if (format === 'markdown')
    output = comparisonMarkdown(data.papers.filter((p) => !ids || ids.includes(p.id)));
  else if (format === 'awesome')
    output = awesomeMarkdown(data.papers.filter((p) => !ids || ids.includes(p.id)));
  else
    throw Error(
      'format must be json, markdown (default comparison table), or awesome (README bullets)',
    );
  if (args.includes('--out')) await writeFile(arg('--out'), output, { flag: 'wx' });
  else process.stdout.write(output);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
