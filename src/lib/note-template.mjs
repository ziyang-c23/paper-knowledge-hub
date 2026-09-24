// Shared by the browser editor, local AI context builder and downloadable templates.
// This module intentionally has no filesystem, Node.js or DOM dependencies.
export const NOTE_TEMPLATE_VERSION = 'paper-note-v4';

export const NOTE_FIELD_RESPONSIBILITIES = {
  metadata: '题名、作者、年份、版本与论文网址由书目字段维护。',
  summary: '问题、方法、数据、评测、结论与局限的短摘要由研究速览字段维护。',
  classification: '专题、任务、方法、模型与数据分类由 topics 和 facets 维护。',
  body: 'note 深入解释推理、机制、实验条件和讨论，不再复制书目卡、摘要表或分类清单。',
  personal: '私人判断和未公开研究构想保留在 personalAnalysis，不进入 AI 上下文。',
};

export const NOTE_SECTIONS = [
  {
    id: 'overview',
    title: '论文概览',
    purpose: '说明论文的核心改变、主要贡献和读懂它的线索。',
    prompt: '用简洁导读连接问题、核心改变及结果成立条件，不重复书目卡、分类清单或首屏速览表。',
  },
  {
    id: 'background',
    title: '研究背景与问题定义',
    purpose: '解释问题为什么成立，已有路线在哪里遇到限制。',
    prompt:
      '围绕研究问题展开背景、任务定义和关键假设。选择真正影响方法设计的前置知识，不重复研究速览。',
  },
  {
    id: 'related-work',
    title: '相关工作',
    purpose: '说明论文与近邻路线的联系与差异。',
    prompt:
      '区分技术来源、实验基线与后续相关工作；共享机制或发表先后不自动代表继承，不把引用理解为采用。',
  },
  {
    id: 'mechanism',
    title: '方法',
    purpose: '把论文方法解释到可以理解设计取舍和实现接口。',
    prompt:
      '沿输入 → 表示 → 核心计算 → 输出解释机制，再说明训练信号、推理流程与关键设计取舍。按需加入公式、流程图、代码对应和失败条件。',
  },
  {
    id: 'experiments',
    title: '实验设计',
    purpose: '解释实验在检验什么，以及哪些设置决定了可比性。',
    prompt:
      '按验证问题组织任务、数据划分、模型变体、基线、适配方式、指标与预算。试验次数或方差未报告时保持未知。',
  },
  {
    id: 'results',
    title: '实验结果与分析',
    purpose: '把主要结论与比较条件、结果和反例连起来。',
    prompt:
      '解释关键结果与消融，保留单位、任务条件、反例和不可比项；图表复用结构化实验记录，不另造一组数值。',
  },
  {
    id: 'discussion',
    title: '局限性与讨论',
    purpose: '解释结果的适用边界，以及值得继续阅读和验证的方向。',
    prompt:
      '分开作者局限、整理者分析与尚未验证的推测。写清哪些条件会改变结论、有哪些替代解释。私人研究构想另存 personalAnalysis。',
  },
  {
    id: 'resources',
    title: '附录',
    purpose: '集中保留继续精读和实现需要的材料。',
    prompt:
      '收纳实际阅读范围、版本差异、原文疑点、定位和官方资源；按已读材料保留完整双语原文、代码观察与长表，不伪造缺失原文或 Conclusion。',
  },
];

export function createNoteTemplate() {
  return (
    NOTE_SECTIONS.map(({ title, prompt }) => `## ${title}\n\n待整理：${prompt}`).join('\n\n') + '\n'
  );
}
