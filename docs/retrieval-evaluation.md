# 检索对照与可解释边界

本轮收益是把原文页加入可核查检索，并清楚区分元数据、笔记、证据和本地 PDF。小样本中，增强排序和关系扩展均未提高直接原文页命中率；没有证据支持加入完整 GraphRAG。

## 三种 V2 策略

- `baseline`：规范化词项的 AND，逐片段匹配；限定 topic/year/status/lifecycle/facets 后检索。默认排除归档。
- `graph`：同一个基础检索结果，另列最多两跳的已审核关系。仅 source/curator 来源、verified 支撑证据、当前可见实体可参与；候选/相似边不参与。扩展不冒充原文命中，也不自动证明问题答案。
- `ranked`：字段权重 + 逆文档频率 + 查询词覆盖比例的词法分数，使用实体规范名/显式别名。至少覆盖一半查询词；未覆盖词与“部分命中，不等于回答成立”一起展示。这不是 embedding、语义检索、学习重排或 GraphRAG。

权重：题名/作者/别名 5，证据和分类实体 3，结构化摘要字段 2，笔记 1.5，私人分析 1.2，PDF 1。分数仅用于排序，不能当作相关概率、支持程度或事实置信度。元数据与 PDF 不同范围的排序也不可直接比较。长自然语言问题仍可能只匹配部分关键词；请检查 missing terms 与原文。本轮未实现自动回答语义判断。

公开模式永远不读取传入的本地 PDF 或 personalAnalysis。私有模式只检索当前已登记附件。coverage 返回当前论文数、原文/页数、尚未解析论文 ID、资料类别、解析质量边界。没有 PDF 的论文不会被描述成“已检索全文”。

## 固定问题、标注与方法

`tests/fixtures/retrieval-queries.json` 保存问题、split、可接受 paper/page 和来源依据；标签由实施代理对照原页全文渲染核对，**不是独立人工专家标注**。只有两份公开 PDF、9 篇示例论文，不代表用户真实私有库或领域规模。

第一批 8 个问题在首次测量前固定：dev 和 heldout 各 3 个正例、1 个不存在字面串。初次脚本同时运行了这两组，因此修复后的 heldout 只算回归集，不再宣称未见过的盲测。修复冻结后另添加 4 个 `final` 问题（3 个原文页定位、1 个不存在字面串），运行后没有按其结果调权重。

指标 **页命中@5**：前 5 条直接结果中是否出现事先标注的可接受 `(paperId,pageIndex)`。每个正例只算一次，是“正确页可达”，不衡量返回文本是否充分支持结论，也不是整个检索系统准确率。不存在字面串要求 direct/expanded 都为空；不等价于识别所有“研究证据不足”的自然语言问题。

V1 对照调用原有 `retrieve`，其语料只有既有公开笔记/证据且无 PDF 页字段。V1 页命中为零反映其未实现此能力，不是同语料排序算法公平优劣。V2 三种策略使用完全相同的两份 PDF。关系扩展单列，不进入直接页命中指标。

## 两轮实际结果

第一轮：V2 三种策略 dev/heldout 各 3/3 原文页命中。ranked 两个不存在串均出现误报：字符串拆词后只命中泛词 `unseen`。第二轮基于 dev 失败加通用最小词覆盖门槛 0.5，并增加泛词重合的单元回归测试；没有为某篇论文或固定答案写例外。修复后两个不存在串均为空。

| 组别 | V1 页命中@5 | V2 baseline | V2 graph | V2 ranked | 不存在串：V1 / baseline / graph / ranked |
| --- | --- | --- | --- | --- | --- |
| dev（3 正 + 1 负） | 0/3 | 3/3 | 3/3 | 3/3 | 1/1 / 1/1 / 1/1 / 1/1 |
| 原 heldout，现回归（3 正 + 1 负） | 0/3 | 3/3 | 3/3 | 3/3 | 1/1 / 1/1 / 1/1 / 1/1 |
| 新 final（3 正 + 1 负） | 0/3 | 3/3 | 3/3 | 3/3 | 1/1 / 1/1 / 1/1 / 1/1 |

最终测量原始结果：`artifacts/evaluation/retrieval-final.json`；首次失败保留在 `artifacts/evaluation/retrieval-round1.json`。包括每次 top5、返回数量、耗时与源文件哈希。新 final 四查询合计：V1 4.304 ms、baseline 59.817 ms、graph 59.530 ms、ranked 60.177 ms（单次本机运行，无热身/多轮统计，不能用于真人效率或性能承诺）。本实现每次扫描小语料，未做大型库索引性能验证。

## 引用支持检查

原页核对支持以下有限表述：OpenVLA file page 10 讨论 LoRA/frozen vision/量化，但脚注 4 限定模型和数据混合；page 21 的 DROID 比例必须连同最后三分之一训练移除说明。Octo file page 4 说明 readout token 与扩散动作头；page 15 的 history/action chunking/shuffle/gripper 结果有特定任务范围。数字比较必须保留这些实验条件。没有用“引用 ID 存在”代替支持关系判断，详见 `fulltext-verification.md`。

尚未验证：真实模型调用、自然语言问题的答案正确率、中文问题跨语言召回、表格数值对齐、全量公式、任意扫描件、超出本例的领域召回、百万片段性能。本轮不声称泛化到这些范围。库里没有充分支持时应保留未知，词法片段不自动变成结论。

## 重跑

```sh
# 先按 fulltext-verification.md 导入两份精确版本 PDF
node scripts/evaluate-retrieval.mjs > tmp/retrieval-evaluation.json
node --test tests/unit/knowledge.test.mjs tests/unit/search-v2.test.mjs tests/integration/pdf.test.mjs
```

测试另覆盖私有/归档过滤、关系审核、PDF 页身份、别名与分类引用、修改后实时检索一致性、关闭模型时纯本机检索。未把这些工程边界测试并入上述研究检索质量指标。

生命周期约定：本机检索与统计默认包含 active 和 draft，排除 archived；草稿属于待维护记录，不表示已审核证据。公开构建只采用显式 public 且 active 的记录。`paperId` 限制直接检索语料与 coverage，避免从论文详情发起的问题意外混入其他论文。专题示例增强不更改固定检索评测使用的 V1 seed 语料，以免把新增文字算成排序改进。
