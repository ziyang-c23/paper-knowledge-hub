# AI 整理工作流

在仓库根目录使用三个可发现入口：`$paper-knowledge-hub` 整理论文、`$hub-entities` 整理实体与关系、`$hub-study` 整理专题与输出。它们在 `.agents/skills/`；当前 Agent 可直接读取 SKILL.md，新开的仓库任务可按名称发现。网页模型配置与外部 Agent 独立：没有模型密钥仍可完成上述工作流。

多源阅读统一由 `$paper-knowledge-hub` 按实际缺口路由，分别读取来源发现与机制解释参考。已有 `$source-discovery`、`$source-reader`、`$explanation-builder` 等入口保留兼容，不要求按八阶段逐个运行。来源发现、实际读取、已索引和解释候选是不同状态；全部复用当前 schema 与草稿箱。

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

[src/lib/note-template.mjs](../src/lib/note-template.mjs) 是浏览器和 AI 上下文共用的笔记契约。新笔记用“论文概览、研究背景与问题定义、相关工作、方法、实验设计、实验结果与分析、局限性与讨论、附录”八章深入解释论文。书目字段负责身份，研究速览字段负责简洁概括，`topics/facets` 负责分类；正文不再复制这些卡片与列表。可下载的 [Markdown](../templates/paper-note.md) 和 [JSON](../templates/paper-recommended.json) 模板与此契约同步。

已有八章或其他 Markdown 不需要批量转换，仍可渲染、编辑与导出。局部补充保留原结构；空标题、模板提示和来源数量不代表完成精读。

## 准备本地上下文

只读检查一篇记录的现有来源、附件和证据，可执行：

```sh
node scripts/research-context.mjs inspect --paper PAPER_ID
node scripts/research-context.mjs reader-context --paper PAPER_ID --out private/ai-drafts/PAPER-reader.json
node scripts/research-context.mjs explain-context --paper PAPER_ID --out private/ai-drafts/PAPER-explain.json
```

`research-context.mjs` 不联网、不修改主库；它只读取当前 revision、已导入附件、证据和 `visuals.resources`，并拒绝把输出写到 `private/` 之外。它不能证明链接已访问或代码已运行。解释结果仍须按下述 `ai:draft` / `ai-task` 流程进入草稿箱。

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

`private/draft-inbox/` 是待审产物，不属于论文正文或主库自动历史。当前完整备份包含草稿、AI 任务和阅读记录；也可从草稿箱单独导出 JSON。

## 按任务整理，而不是整篇覆盖

本地版的 AI 任务有四种明确入口：补充一个笔记章节、提取结构化实验、比较论文写回专题，以及根据已读来源生成局部机制解释。任务先生成本地上下文文件，导出后可交给用户选择的模型或本地 Agent；服务本身不自动发送材料或调用云模型。结果导入后成为待审草稿，由人选择字段应用。

- **机制解释**：类型 `explanation`，输出 `{ "explanations": [...] }`；每项有 `id/title/body/kind/sourceIds`，来源必须属于当前论文且已读、允许加入上下文。只合并局部解释，未知来源或未经验证的运行结果会被拒绝。
- **补章节**：选择八章中的一个章节，结果 JSON 使用 `{ "sectionText": "章节正文" }`。正文可使用三级标题；后台只替换所选二级章节，保留其他章节与私人字段。
- **提取实验**：结果 JSON 使用 `{ "experiments": [...] }`，记录格式见上下文的 `resultTemplate`；只更新 `visuals.experiments`。数值、单位、条件和来源进入同一记录，未知数值使用 `null`。
- **比较论文**：选择 2–20 篇论文和已有专题，结果 JSON 使用 `{ "analysis": "...", "questions": [], "gaps": [] }`；更新专题分析及比较论文集合。

任务状态为待运行、上下文已准备、待审、失败、已应用或已取消。“上下文已准备”表示等待用户导入模型结果，不代表模型正在运行。导入过期结果会失败；刷新当前数据库后重试将重新生成上下文，不会把旧结果自动覆盖到新版本。取消待审任务同时取消其关联草稿。任务、上下文、草稿和阅读记录都纳入本地备份。

命令行也使用相同流程（所有修改需要当前 workspace revision）：

```sh
node scripts/ai-task.mjs create --revision REVISION --type section --papers PAPER_ID --section mechanism
node scripts/ai-task.mjs prepare --revision REVISION --id TASK_ID
node scripts/ai-task.mjs context --id TASK_ID
node scripts/ai-task.mjs import --revision REVISION --id TASK_ID --result RESULT.json
node scripts/ai-task.mjs list
```

`prepare` 将真实上下文写入 `private/ai-tasks/TASK_ID.context.json`；`import` 只创建草稿。应用可在草稿箱完成，或显式执行 `apply --revision REVISION --id TASK_ID`。公开示例的 AI 结果先转为本地私有记录，不自动发布。

## 多源上下文与版本

新来源维护在 `paper.sources`，`sourceBundle` 由共享 adapter 兼容读取，不重复双写。上下文仅纳入 `aiAllowed: true` 来源并排除嵌套私人字段；这仍是本地上下文，不是外发授权。`research-context` 提供定向解释资料，`ai:prepare` 包含完整笔记/PDF；保存链接不表示读过代码或视频。

草稿命令必须显式传入生成上下文时捕获的 `--revision`，不能用省略参数把过期候选默认为最新版本。遇冲突先重新读取和合并；通用草稿可修改来源/媒体/方法字段，专用任务只接收其 `resultTemplate` 定义的结果。
