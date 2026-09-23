// Shared by the browser editor, local AI context builder and downloadable templates.
// This module intentionally has no filesystem, Node.js or DOM dependencies.
export const NOTE_TEMPLATE_VERSION = 'paper-note-v3';

export const NOTE_FIELD_RESPONSIBILITIES = {
  metadata: '题名、作者、年份、版本与论文网址由书目字段维护。',
  summary: '问题、方法、数据、评测、结论与局限的短摘要由研究速览字段维护。',
  classification: '专题、任务、方法、模型与数据分类由 topics 和 facets 维护。',
  body: 'note 深入解释推理、机制、实验条件和讨论，不再复制书目卡、摘要表或分类清单。',
  personal: '私人判断和未公开研究构想保留在 personalAnalysis，不进入 AI 上下文。',
};

export const NOTE_SECTIONS = [
  {
    id: 'background',
    title: '背景与研究脉络',
    purpose: '解释问题为什么成立，已有路线在哪里遇到限制。',
    prompt:
      '围绕研究问题展开背景、关键假设和近邻工作的差异。选择真正影响方法设计的前置知识，不重复研究速览。',
  },
  {
    id: 'mechanism',
    title: '方法与机制',
    purpose: '把论文方法解释到可以理解设计取舍和实现接口。',
    prompt:
      '沿输入 → 表示 → 核心计算 → 输出解释机制，再说明训练信号、推理流程与关键设计取舍。按需加入公式、流程图、代码对应和失败条件。',
  },
  {
    id: 'experiments',
    title: '实验与结果分析',
    purpose: '把每个主要结论与其比较条件、结果和反例连起来。',
    prompt:
      '按验证问题组织实验，而不是复述所有表格。记录任务、数据、基线、指标与预算；解释关键结果和消融，保留缺失项、反例及不可直接比较的条件。',
  },
  {
    id: 'discussion',
    title: '讨论与启发',
    purpose: '解释结果的适用边界，以及值得继续阅读和验证的方向。',
    prompt:
      '分开作者局限、整理者分析与尚未验证的推测。写清哪些条件会改变结论、有哪些替代解释。私人研究构想另存 personalAnalysis。',
  },
  {
    id: 'resources',
    title: '资源与复核',
    purpose: '集中保留继续精读和实现需要的材料。',
    prompt:
      '记录本次实际阅读范围、尚未解决的原文疑点、图表或章节位置、官方代码与模型入口。只在有材料时附加代码观察或双语摘录，不强制粘贴全文。',
  },
];

export function createNoteTemplate() {
  return (
    NOTE_SECTIONS.map(({ title, prompt }) => `## ${title}\n\n待整理：${prompt}`).join('\n\n') + '\n'
  );
}
