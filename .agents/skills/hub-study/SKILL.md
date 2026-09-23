---
name: hub-study
description: 检索 Paper Knowledge Hub 中的已有论文与证据，整理专题分析、比较材料和 Markdown 或 Awesome 输出。
---

# 专题分析与材料输出

输入研究问题、topic ID 或论文集合，以及所需输出。先读 [接口与约束](../../../docs/ai-workflows.md)，读取目标论文笔记、实体和已核验证据。必要时补读原文；只依据库内笔记时说明范围，不冒充新一轮文献穷尽调研。

先定义比较问题，再按机制、输入输出、数据预算、实验条件和局限组织材料。共同数据集不保证指标可比。区分作者结论、整理者推断、候选关系和未覆盖项。可用 `src/lib/knowledge.mjs` 的 comparisonMarkdown 生成比较底稿，在 topic.analysis 中写阶段性理解，compareIds/evidenceIds 连接实际记录，gaps 写库内缺口。

更新已有专题时保留 ID 和既有字段。创建 `{collection:"topics",record,sourceMaterial,uncertainties}` 后：

```sh
npm run ai:draft -- private/ai-drafts/topic.json --collection topics
npm run ai:draft -- private/ai-drafts/topic.json --collection topics --stage
```

在网页 `#/drafts` 审阅应用，或依据用户已授权范围通过 revision-aware CLI 写入。回读 `#/topic/ID`，打开代表证据、进入比较页，导出研究材料。论文归属只改 paper.topics，不在 topic 维护第二份成员列表。

本地私人材料导出用 `npm run study:export -- --ids ID1,ID2 --out private/exports/comparison.md`；公开 CLI `npm run export` 只含公开投影，不能用其空结果推断主库无内容。Awesome 是可审阅条目，不自动发布到其他仓库。
