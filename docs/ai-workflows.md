# AI 整理工作流

在仓库根目录使用三个可发现入口：`$paper-knowledge-hub` 整理论文、`$hub-entities` 整理实体与关系、`$hub-study` 整理专题与输出。它们在 `.agents/skills/`；当前 Agent 可直接读取 SKILL.md，新开的仓库任务可按名称发现。网页模型配置与外部 Agent 独立：没有模型密钥仍可完成上述工作流。

草稿格式：

```json
{"collection":"papers","record":{"schemaVersion":1,"id":"example","title":"Actual title","year":2024,"authors":[],"url":"https://example.org/paper","visibility":"private","note":"已整理的正文"},"sourceMaterial":["实际读取的 URL 或文件"],"uncertainties":["尚未核实的问题"]}
```

完整字段定义：`schemas/dataset.schema.json`；主库字段：`docs/data-model.md`。这只是格式示例，不作为论文事实。

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
