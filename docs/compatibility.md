# 与既有 Markdown 论文库的兼容边界

本模板使用 `content/papers/<id>.json`：结构化字段与唯一 canonical `note` Markdown 正文放在同一个对象中。它不是既有个人知识库的自动同步器。本次只读检查了一个 legacy `note.md` 的结构、`catalog.json` 的键结构和所在目录约定；没有迁移、修改或发布原库内容，也未读取 Notion 页面。

## 观察到的两类结构

| 既有库结构 | 本模板字段 | 迁移注意事项 |
|---|---|---|
| `papers/<slug>/note.md` 的标题、首部列表与章节 | `title`、`authors`、`year`、`note` | legacy Markdown 首部不是统一 YAML；不能承诺无损自动抽取 |
| `catalog.json` 的 `papers[slug]` 主题数组 | `paper.topics` | 既有库以 catalog 为唯一主题权威；不要反向在原库建立竞争字段 |
| `catalog.json` 的 topic `id/name/group` | 独立 `topics/<id>.json` | 本模板需补充边界、问题和比较维度，不能从 group 自动推导 |
| `materials/` 中的 PDF、图与附件 | 正文链接，或自行设计的公开媒体目录 | 忽略状态和本地所有权不等于公开许可；不自动复制附件 |
| legacy 中带 emoji、英文或其他章节标题 | `note` 中任意 Markdown | 不强制重排旧文档；当前 3 个样例使用八节结构，正文仍是原生 Markdown |
| Notion 页面 ID、同步状态或收据 | 默认不映射 | 本模板未实现 Notion 拉取、增量回写或冲突合并 |

## 当前导入器支持什么

已读取当前 `scripts/import.mjs`：导入器接受 schema v1 JSON 单篇对象或完整 dataset bundle，默认 dry run，`--write` 才写入。**当前不直接解析 Markdown frontmatter 或 BibTeX，也没有实现既有 `catalog.json + legacy note.md + materials/` 的自动适配器**。Markdown 正文可放入 JSON 的 `note` 字段；这不等于从任意 Markdown 自动抽取元数据。若从 BibTeX 转换，需先生成符合 schema 的 JSON，不能推断阅读状态、可信证据、图谱采用关系或科学结论。

建议先在私有副本做一篇迁移：人工核对元数据，把原文保存为该 paper 的唯一 `note`，从 catalog 显式映射主题，再将公开证据和私有评论分开。检查本地链接与图片目标后执行 validate 和 public build，检查生成的公开 JSON/站点中是否出现不应公开的文本。只有明确选择的公开内容才进入 `content/`；原私有资料继续留在原库。

## 未实现的部分

没有 watcher、双向同步、Notion API、附件许可判断、OCR、自动引用解析或历史版本合并。新增真实适配器时需要单独定义冲突策略、稳定 ID 映射、附件规则和可回滚迁移记录。本说明只证明进行了结构兼容性评估，不代表迁移成功。
