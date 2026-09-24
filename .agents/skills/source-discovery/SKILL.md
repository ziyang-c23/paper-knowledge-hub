---
name: source-discovery
description: 为论文或技术报告建立多源材料清单，区分版本、来源类型、访问状态与公开边界。
---

共享入口与契约：[paper-knowledge-hub](../paper-knowledge-hub/SKILL.md)。本技能保留为定向兼容入口；数据字段、revision、隐私和网页审阅均沿共享契约，不要求执行其余所有技能。


# 多源发现

输入论文 ID、标题、论文 URL、项目页或代码 URL。先读 `docs/ai-workflows.md` 与当前 workspace；使用官方论文页、PDF、项目页、代码仓库和模型/数据卡建立候选清单。搜索结果只是候选，不是已读证据。

只读检查现有条目：

```sh
node scripts/research-context.mjs inspect --paper PAPER_ID
```

每个候选来源记录 URL 或本地文件、类型、标题、发布者、版本/commit、获取时间、访问状态、许可/公开状态、支持的主张、不能支持的主张、是否实际读取、是否允许公开及是否允许发送 AI。类型至少使用 `paper`、`abstract`、`official-project`、`official-code`、`readme`、`documentation`、`model-card`、`dataset-card`、`demo`、`video`、`issue`、`release`、`code-observation`、`runtime-result`、`curator-analysis`。

不要把当前 GitHub 主分支当成论文实验版本；不要下载或重新分发未授权视频/PDF。发现多个版本时保留版本差异和待核验项。输出来源清单与推荐阅读顺序，不能直接写主库；需要整理时进入 `ai:prepare`/`ai-task` 草稿流程。
