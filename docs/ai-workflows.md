# AI 整理工作流

在仓库根目录使用三个可发现入口：`$paper-knowledge-hub` 整理论文、`$hub-entities` 整理实体与关系、`$hub-study` 整理专题与输出。它们在 `.agents/skills/`；当前 Agent 可直接读取 SKILL.md，新开的仓库任务可按名称发现。网页模型配置与外部 Agent 独立：没有模型密钥仍可完成上述工作流。

草稿格式：

```json
{
  "collection": "papers",
  "record": {
    "schemaVersion": 1,
    "id": "example",
    "title": "Actual title",
    "year": 2024,
    "authors": [],
    "url": "https://example.org/paper",
    "visibility": "private",
    "note": "已整理的正文"
  },
  "sourceMaterial": ["实际读取的 URL 或文件"],
  "uncertainties": ["尚未核实的问题"]
}
```

完整字段定义：`schemas/dataset.schema.json`；主库字段：`docs/data-model.md`。这只是格式示例，不作为论文事实。

## 笔记与网页分工

[src/lib/note-template.mjs](../src/lib/note-template.mjs) 是浏览器和 AI 上下文共用的笔记契约。新笔记用“背景与研究脉络、方法与机制、实验与结果分析、讨论与启发、资源与复核”五章深入解释论文。书目字段负责身份，研究速览字段负责简洁概括，`topics/facets` 负责分类；正文不再复制这些卡片与列表。可下载的 [Markdown](../templates/paper-note.md) 和 [JSON](../templates/paper-recommended.json) 模板与此契约同步。

已有八章或其他 Markdown 不需要批量转换，仍可渲染、编辑与导出。局部补充保留原结构；空标题、模板提示和来源数量不代表完成精读。

## 准备本地上下文

```sh
npm run ai:prepare -- --paper PAPER_ID
npm run ai:prepare -- --paper PAPER_ID --out private/ai-drafts/PAPER_ID-context.json
```

省略 `--out` 使用上方默认路径；显式选项必须带值。命令仅写本地上下文文件，不改主库、不调用模型。包中包含 `baseRevision`、论文字段、该论文已附加 PDF 的逐页文本/解析警告、现有来源与关系、共享笔记模板及字段职责。`personalAnalysis` 和历史 `privateNotes` 被排除；其余本地资料仍可能私有，文件生成不代表外发授权。网页模型网关继续只消费允许发送的公开材料。

上下文不是可直接导入的论文记录。模型输出先设为 private；本地 Agent 读取当前完整记录后只合并确认修改，保留未修改字段及上下文排除的私人内容，再用 fresh revision 送入草稿流程。不要因模型未返回私人字段而把它们从主库删除。

## 审阅与应用

```sh
npm run workspace -- status
npm run ai:draft -- private/ai-drafts/paper.json --collection papers
npm run ai:draft -- private/ai-drafts/paper.json --collection papers --stage
```

`--stage` 只保存可持久审阅的草稿，输出 `#/drafts?id=...`。网页可编辑 JSON、阅读渲染正文、查看修改前字段、检查来源、确认后应用。主库版本变化会停止应用，不自动重放旧整条记录；导出草稿，读取最新记录，人工或 Agent 合并后重新导入。

若用户已明确授权本地写入：

```sh
npm run ai:draft -- private/ai-drafts/paper.json --collection papers --revision HASH --write
```

写完后重新读取 fresh revision，核对记录和网页。不要直接编辑 private/workspace.json，不改稳定 ID 绕过查重。草稿箱只接受 private 记录；公开审查通过原有记录编辑流程，不因模型输出而扩大公开范围。

研究关系必须引用真实 evidence；approved 需要 verified evidence 以及 source/curator origin。模型候选保持 pending。私人内容只进入本地草稿和导出，不发送网页模型；网页模型网关依然只消费经同意的公开证据。

`private/draft-inbox/` 是待审产物，不属于主库自动历史和完整库备份。需要保留待审草稿时从草稿箱导出 JSON；已应用内容进入主库正常备份。
