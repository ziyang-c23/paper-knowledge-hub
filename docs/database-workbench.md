# 数据库与研究实体工作台

本轮新增 `#/database` 论文数据库和 `#/entities` 研究对象目录。数据库支持表格、看板、画廊、列表、月历、保存视图、嵌套 AND/OR 筛选、排序、列顺序、类型化自定义属性、公式/汇总属性、批量修改、撤销和 CSV 导出。研究对象目录按六组逻辑分工：人物与团队（`person/institution/project`）、方法与模型（`method/model`）、数据与评测（`dataset/environment/benchmark`）、任务（`task`）、概念（`concept`）、开放问题（`problem`）。旧的 `/entities` 路由仍兼容，跨域索引明确标注为检索入口；物理上仍使用 `concepts` 集合以兼容旧数据。对象保存别名、简介、Markdown 档案、来源、分类维度、手工关联与反向引用。

两者共用 `private/workspace.json`、稳定 ID、revision 冲突保护、备份恢复和公开投影。实体来源保留 URL 与支持范围说明，链接不会自动等于任职或贡献已核验。只有 `approved` 且来自 `source`/`curator` 的关系进入确定论文汇总；模型候选、待审核和拒绝关系仍可回查。新建实体使用 create-only 语义，已有 ID 不会被覆盖；`new` 可作为合法 ID。

```sh
npm ci
npm run workspace -- init --write
npm run build
npm run local
```

旧库没有 `database` 字段时使用默认视图，首次保存时才加入配置。旧 `concept/method/dataset` 类型保持兼容；`concept` 且 `dimension=problem` 仍表示问题域概念，开放问题使用 `kind=problem`。实体正文、来源、个人属性和视图不会进入公开构建。

公式属性是只读派生值，不把结果复制进论文 JSON。表达式使用受限语法，例如 `prop("year") - 2020`、`length(prop("tags"))`、`ifEmpty(prop("custom:score"), 0)`；支持基础算术、比较、`prop`、`length`、`count`、`sum`、`if`、`ifEmpty`、`concat` 和 `round`。保存时会检查未知字段和循环引用。汇总属性从论文关联属性读取关联论文，支持计数、求和、平均、最小、最大和去重文本；没有 JavaScript `eval`，计算失败显示为空并可继续维护原始资料。

验证命令仍以仓库当前代码和 CI 结果为准：`npm test`、`npm run format:check`、`npm run validate`、`npm run build`，以及与本轮页面改动对应的浏览器场景。本文不记录会随代码和数据变化的论文数量、测试数量或“当前全部通过”结论；历史截图和验收记录只用于回查当时的版本。数据库的公式/rollup、只读派生值、保存回读竞态、实体 ID 覆盖、来源隔离和候选关系仍属于应持续验证的功能边界。

AI 接入入口是仓库内 [.agents/skills/paper-knowledge-hub/SKILL.md](../.agents/skills/paper-knowledge-hub/SKILL.md) 和 `npm run ai:draft`。它读取一个带 `record`、`sourceMaterial`、`uncertainties` 的草稿 envelope，默认只按当前 revision 做完整校验；只有显式 `--revision HASH --write` 才落盘，`--create-only` 防止新实体覆盖既有 ID。它不把模型候选关系自动变成已审核关系。

仍未实现完整 Notion 块编辑器、云协作权限、批量 CSV 映射、回收站和大规模性能验证；真实模型调用也未验证。自动保存历史已支持最近 100 个主库快照，但不包含 PDF 原件恢复。
