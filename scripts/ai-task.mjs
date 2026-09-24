import { readFile } from 'node:fs/promises';
import { listAITasks, mutateAITask, getAITaskContext } from '../services/ai-tasks.mjs';
const [action, ...args] = process.argv.slice(2);
const flags = new Map();
try {
  for (let index = 0; index < args.length; index += 2) {
    if (
      ![
        '--id',
        '--type',
        '--papers',
        '--topic',
        '--section',
        '--question',
        '--revision',
        '--result',
        '--fields',
      ].includes(args[index]) ||
      flags.has(args[index]) ||
      !args[index + 1] ||
      args[index + 1].startsWith('--')
    )
      throw Error('Invalid or missing option: ' + args[index]);
    flags.set(args[index], args[index + 1]);
  }
  const root = process.cwd();
  const input = {
    action,
    id: flags.get('--id'),
    type: flags.get('--type'),
    paperIds: flags.get('--papers')?.split(','),
    topicId: flags.get('--topic'),
    sectionId: flags.get('--section'),
    question: flags.get('--question'),
    expectedRevision: flags.get('--revision'),
    acceptedFields: flags.get('--fields')?.split(','),
  };
  if (flags.has('--result'))
    input.result = JSON.parse(await readFile(flags.get('--result'), 'utf8'));
  const result =
    action === 'list'
      ? { tasks: await listAITasks(root) }
      : action === 'context'
        ? await getAITaskContext(root, input.id)
        : await mutateAITask(root, input);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  console.error(
    'Usage: node scripts/ai-task.mjs create|prepare|import|cancel|retry|apply|list|context --revision HASH [--id TASK_ID --type section|experiments|compare|explanation --papers ID,ID --topic ID --section SECTION_ID --result RESULT.json]',
  );
  process.exitCode = 1;
}
