// One parser for review display and merging. Offsets retain unselected source bytes.
export const NOTE_PREAMBLE_ID = '@preamble';
export function normalizeSectionTitle(value) {
  return String(value || '')
    .trim()
    .replace(/^\d+[.、)）]\s*/, '')
    .toLowerCase();
}
export function noteSections(note) {
  const text = String(note || ''),
    headings = [];
  let fence = null;
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const value = line[0].replace(/\r?\n$/, '');
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`).test(value)) fence = null;
      continue;
    }
    const opening = value.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { char: opening[1][0], length: opening[1].length };
      continue;
    }
    const heading = value.match(/^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (heading)
      headings.push({
        offset: line.index,
        title: normalizeSectionTitle(heading[1]),
        label: heading[1].trim(),
      });
  }
  return {
    preamble: text.slice(0, headings[0]?.offset ?? text.length),
    sections: headings.map((heading, index) => ({
      id: heading.title,
      title: heading.title,
      label: heading.label,
      text: text.slice(heading.offset, headings[index + 1]?.offset ?? text.length),
    })),
  };
}
export function noteSectionChanges(baseNote, proposedNote) {
  const base = noteSections(baseNote),
    proposed = noteSections(proposedNote);
  const baseBy = new Map(base.sections.map((section) => [section.id, section]));
  const proposedBy = new Map(proposed.sections.map((section) => [section.id, section]));
  const changes = [...new Set([...baseBy.keys(), ...proposedBy.keys()])]
    .filter((id) => baseBy.get(id)?.text !== proposedBy.get(id)?.text)
    .map((id) => ({
      id,
      title: proposedBy.get(id)?.label || baseBy.get(id).label,
      before: baseBy.get(id)?.text || '',
      after: proposedBy.get(id)?.text || '',
      kind: !baseBy.has(id) ? 'added' : !proposedBy.has(id) ? 'removed' : 'modified',
    }));
  if (base.preamble !== proposed.preamble)
    changes.unshift({
      id: NOTE_PREAMBLE_ID,
      title: '章节前正文',
      before: base.preamble,
      after: proposed.preamble,
      kind: !base.preamble ? 'added' : !proposed.preamble ? 'removed' : 'modified',
    });
  return changes;
}
export function changedNoteSections(baseNote, proposedNote) {
  return noteSectionChanges(baseNote, proposedNote).map((change) => change.id);
}
export function mergeNoteSections(baseNote, proposedNote, selected) {
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.some((id) => typeof id !== 'string' || !id.trim())
  )
    throw new Error('请选择至少一个有效笔记章节');
  const base = noteSections(baseNote),
    proposed = noteSections(proposedNote);
  for (const parsed of [base, proposed]) {
    const ids = parsed.sections.map((section) => section.id);
    if (new Set(ids).size !== ids.length)
      throw new Error('重复的笔记章节标题无法安全合并，请先消歧');
  }
  const chosen = new Set(selected.map(normalizeSectionTitle));
  const changed = new Set(changedNoteSections(baseNote, proposedNote));
  if ([...chosen].some((id) => !changed.has(id))) throw new Error('笔记章节选择必须来自当前变更');
  const proposedBy = new Map(proposed.sections.map((section) => [section.id, section]));
  const baseIds = new Set(base.sections.map((section) => section.id));
  const blocks = base.sections.flatMap((section) =>
    chosen.has(section.id)
      ? proposedBy.has(section.id)
        ? [proposedBy.get(section.id)]
        : []
      : [section],
  );
  // New sections are inserted next to their proposed neighbors, only when selected.
  for (const [index, section] of proposed.sections.entries()) {
    if (baseIds.has(section.id) || !chosen.has(section.id)) continue;
    const successor = proposed.sections
      .slice(index + 1)
      .find((next) => blocks.some((block) => block.id === next.id));
    const insertAt = successor
      ? blocks.findIndex((block) => block.id === successor.id)
      : blocks.length;
    blocks.splice(insertAt, 0, section);
  }
  let result = chosen.has(NOTE_PREAMBLE_ID) ? proposed.preamble : base.preamble;
  for (const block of blocks) {
    if (result && !result.endsWith('\n')) result += '\n\n';
    result += block.text;
  }
  return result;
}
