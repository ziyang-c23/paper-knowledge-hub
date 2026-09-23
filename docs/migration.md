# 迁移与已有研究流程

支持的实际输入是标准 JSON 单论文 / bundle，以及辅助命令将 Markdown 原文填到标准 Paper 的 note。没有声称支持 Notion ZIP、Zotero API、BibTeX 或任意 YAML。

已实际核对的旧库结构及边界见 [compatibility.md](compatibility.md)。不要把 schema 相近当作已测试自动迁移。

建议小批迁移：

1. 从现有资料选 1—3 篇，先创建 ignored private/ 下的标准 JSON。手动映射 title/year/authors/url 和明确的稳定 ID；旧分类暂写 tags，不擅自当作模板 topics。
2. 使用 `npm run note:attach -- private/meta.json existing-note.md private/import.json`。保留旧来源作证据输入，但从迁移完成后只编辑新的 canonical note；如果旧库仍是权威，则本项目只作为导出投影，需由外部脚本每次重新产生 JSON，不在两边手工编辑。
3. 默认以 private 草稿纳入本地主库；未公开 idea 放 personalAnalysis，PDF 使用本地附件入口。公开是后续独立审查，不是本机检索的前提。
4. 将来源定位拆为 Evidence，人工确认方法/数据集/主题含义后再加 Relation；不自动把文中所有链接转成 uses。
5. 在本地编辑器核对并保存，或 workspace put dry run 后带 revision 写入；刷新检查列表、详情、查询和图谱。公开站才需要重建。更新 README 条目只用公开 export 输出候选，人工审核后处理。

需要自动迁移时，先固定一份真实脱敏导出样本和字段映射，再为该格式加 importer 与断言。不要扩大现有 JSON importer 的宣传范围。
