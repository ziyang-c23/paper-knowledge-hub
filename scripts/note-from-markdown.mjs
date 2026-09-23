import { readFile, writeFile } from 'node:fs/promises';
try {
  const [input, markdown, output] = process.argv.slice(2);
  if (!input || !markdown || !output)
    throw Error('Usage: npm run note:attach -- paper.json note.md output.json');
  const p = JSON.parse(await readFile(input, 'utf8'));
  p.note = await readFile(markdown, 'utf8');
  await writeFile(output, JSON.stringify(p, null, 2) + '\n', { flag: 'wx' });
  console.log(
    `Draft written: ${output}; run import dry-run next. Markdown is input material, not a second canonical body.`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
