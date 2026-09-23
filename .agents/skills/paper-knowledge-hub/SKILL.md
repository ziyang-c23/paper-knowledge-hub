---
name: paper-knowledge-hub
description: 从论文链接、PDF 或已有笔记整理或更新 Paper Knowledge Hub 论文记录，生成可在网页审阅和应用的草稿。
---

# 论文整理与入库

在本仓库根目录执行命令。输入为论文身份、链接、PDF 或已有笔记，以及用户要求的新增／补充范围。输出是完整论文 JSON 草稿、网页草稿入口及必要的未核验项；不另建一份长期维护的正文。

先读 [数据与草稿接口](../../../docs/ai-workflows.md) 和 [笔记结构](references/note-format.md)。使用 `npm run workspace -- status` 识别主库，按 ID、DOI、arXiv、标题查重，读取已有完整记录后只合并本轮字段。`private/workspace.json` 初始化后为权威源，只读它；写入使用 CLI/API。

依据实际读取材料解释问题、贡献、机制、实验条件和局限。原文、整理者推断、代码观察与运行结果分别标明；已有笔记作为输入时不得声称重新核验了论文。缺失的原文、数字与页码保持未知。论文正文只保存在 `record.note`，个人判断可用 `personalAnalysis`，默认 private。PDF 附件独立保留，不复制全文作为笔记。

新笔记导入 `src/lib/note-template.mjs` 的 `createNoteTemplate()` / `NOTE_SECTIONS`，正文深入背景、机制、实验分析、讨论和资源。书目信息、研究速览与分类分别维护在结构化字段，正文不重复它们。旧八章笔记正常保留；局部补充不强制整篇迁移。模板不是论文事实，不根据已出现几个标题推断完成精读。

将 `{collection:"papers",record,sourceMaterial,uncertainties}` 保存至 ignored `private/ai-drafts/`，执行：

```sh
npm run ai:draft -- private/ai-drafts/paper.json --collection papers
npm run ai:draft -- private/ai-drafts/paper.json --collection papers --stage
```

第二条把通过校验的草稿送入网页 `#/drafts`，不修改论文。用户可在那里阅读、编辑与确认应用。若用户已经明确授权本地入库，读取 fresh revision 后执行 `--revision HASH --write`，无需重复索要同一授权。新建记录加 `--create-only`；不要以换 ID 绕过冲突。

已有本地论文需要交给 Agent 或模型继续整理时，先生成版本化上下文包：

```sh
npm run ai:prepare -- --paper PAPER_ID --out private/ai-drafts/PAPER_ID-context.json
```

省略 `--out` 时默认保存到 `private/ai-drafts/PAPER_ID-context.json`。该包只写入 ignored `private/`，包含论文字段、已附加 PDF 的逐页文本、证据、关系、五章模板和字段职责；排除 `personalAnalysis` 与旧 `privateNotes`，保存 `baseRevision`。它仍包含本地论文/PDF，生成文件不授权外发，也不会自动调用模型。

模型输出不能直接覆盖完整记录。应用前在本地读取当前论文，把本轮确认修改合并进去，保留未修改字段及上下文刻意排除的私人字段；使用 fresh revision。模型生成的 JSON 仍必须经过 `npm run ai:draft ... --stage` 和网页草稿箱审阅，不能把上下文包直接写回主库。

保存后重新读取记录，在网页打开 `#/paper/ID` 检查正文与附件，使用导出笔记输出 Markdown。关联实体交给 `$hub-entities`，跨论文材料交给 `$hub-study`。外部发布不在此技能授权内。
