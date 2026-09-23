# 研究工作台产品原则

本轮只保留会改变研究动作的能力，避免把论文页做成字段清单。设计参考了 2026-09-24 读取的公开资料，并区分已经转化到本站的做法与仅供后续研究的项目：

**已转化为当前界面的做法**

- [Zotero 集合与标签](https://www.zotero.org/support/collections_and_tags) 和 [PDF Reader / Notes](https://www.zotero.org/support/reader)：借鉴集合、状态、原文与笔记连续阅读；本站保留自己的本地数据和四个论文动作，并未接入 Zotero 同步。
- [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy)：借鉴本地数据、数据库视图和文档并存；本站已实现论文表格与对象目录，但没有复制其通用协作层。
- [React Flow](https://github.com/xyflow/xyflow)、[Cytoscape.js](https://github.com/cytoscape/cytoscape.js) 与 [D3 force](https://d3js.org/d3-force)：借鉴可缩放、可聚焦的局部关系图；本站当前使用轻量 SVG 图谱，没有把黑盒布局当成知识结论。

**已调研但尚未接入的流程参考**

- [GROBID](https://github.com/kermitt2/grobid) 的 PDF 结构化解析、[PaperQA2](https://github.com/Future-House/paper-qa) 的带引用检索、[OpenAlex](https://docs.openalex.org) 的开放文献图谱，以及 [LitStudy](https://github.com/NLeSC/litstudy) 的集合分析，均是后续导入和专题分析的参考；当前项目没有声称已经集成这些服务。
- [Hypothes.is](https://github.com/hypothesis/h)、[Gwern 的设计说明](https://gwern.net/design)、[Quartz 的页面预览](https://quartz.jzhao.xyz/features/popover-previews) 和 [Distill 模板](https://github.com/distillpub/template) 提供页级锚点、原位预览和交互式解释的方向；当前仅实现本地 PDF 页定位、对象回链和有限的图谱交互。
- [SurVis](https://github.com/fabian-beck/survis)、[Paperlib](https://github.com/Future-Scholars/paperlib)、[Paperpile Claude Code template](https://github.com/alexiahartzell/paperpile) 和 [arXiv Sanity Preserver](https://github.com/karpathy/arxiv-sanity-preserver) 的文献集合、收集队列、PDF 流程和候选推荐可作为未来改进依据；推荐结果仍需回到原文核验，不会自动写成关系。

## 取其长处，保持当前项目边界

论文条目只有一份 canonical record。阅读桌把收藏/状态、条目列表和选中条目速览放在一起；论文表格负责批量属性和保存视图；专题、实体、证据和比较通过链接进入上下文。这样集合、标签和数据库视图不会复制论文正文。

原文与笔记并排阅读，页面级阅读记录暂存在当前浏览器，确认后再写入正式 note 或 evidence。记录先服务于阅读动作，避免把每次临时想法自动升级成论文主张。

网页相对传统数据库的增量集中在跨对象动作：从一个结论回到 PDF 页，从论文进入方法/数据集实体，从选中文献生成比较，从 PDF 文本生成版本化 AI 上下文，再经草稿箱确认。图谱只承担上下文导航，不用密集节点图替代阅读。

## 这个网页工作台要解决的关键动作

Zotero 仍然适合收藏、去重和管理 PDF；Notion 仍然适合自由排版和协作。本站的核心增量只保留四个实际动作：

1. **原文**：从研究速览或对象关联回到 PDF 页，保留页码和段落定位。
2. **笔记**：用结构化笔记解释问题、机制、实验和局限；模板用于组织内容，不把章节数量当作阅读完成证明。
3. **研究配置**：把论文涉及的方法、模型、数据、任务、概念和开放问题连接到对应对象，分类与原文关系分开显示。
4. **专题比较**：选中论文后直接生成比较矩阵，突出差异，空白字段保持“未整理”，并可回到原文或保存进专题。

这四条链路比增加更多字段更重要。AI 只作为导入、检索和草稿整理的辅助，必须经过人工确认才写回主库。新增界面只有在缩短“阅读 → 判断 → 比较 / 追溯”路径时才进入产品；统计、证据标识和内部状态放在次级面板，避免抢占论文主线。

关系探索页现在承担网页最有价值的动态交互：以论文或实体为中心生成局部网络，节点聚焦会淡化无关路径，关系边显示流动提示，画布支持拖拽、缩放和键盘访问，右侧检查器同步展示来源与审核状态。它表达的是“如何回查和选择下一步”，而不是把关系数量做成装饰性大图。

这些参考共同指向一条主线：找到问题 → 阅读原文 → 结构化配置 → 比较论文 → 更新专题。它们不是本站已经部署的依赖，也不构成对论文内容的自动判断。

公开 GitHub Pages 只承载公开投影和模板；完整 PDF、个人分析、私有笔记和本地阅读记录留在本地空间。未来若需要多人/跨设备同步，应增加受控文档存储和权限层，而不是把私有附件直接复制到静态站点。

## 后续优先级

1. 为 PDF 页面批注增加可选的正式 evidence 转换入口，并保留页码、引文和核验状态。
2. 为阅读桌增加树状专题/集合和保存搜索，集合只保存筛选条件与条目 ID，不复制正文。
3. 将 `ai:prepare` 扩展为“导入 PDF → 生成上下文 → 生成 draft → 草稿箱审阅”的单命令编排；模型不可用时仍保留确定性上下文包。
4. 若引入语义检索，先展示命中的原文片段和来源，再提供模型回答；不以黑盒聊天替代检索。
