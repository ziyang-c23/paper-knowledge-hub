# Paper Knowledge Hub

个人研究知识工作台。论文、研究实体、专题、证据和可审阅的 AI 草稿使用同一份本地数据；无需模型密钥或云账户。

## 启动

Node.js 22.13+，推荐 24 LTS。

```sh
npm ci
npm run workspace -- init --write  # 首次初始化；已有主库不会覆盖
npm run build
npm run local
```

打开 **http://127.0.0.1:4176/**。这是可编辑的完整本地空间。`npm run dev`和`npm run preview` 只展示公开投影；主库默认私有，所以公开预览可能为空。公开 GitHub Pages 只承载应用模板和明确允许公开的示例记录，完整 PDF、个人分析和私有笔记留在本地空间。

## 从哪里开始

| 区域       | 使用方式                                               |
| ---------- | ------------------------------------------------------ |
| 工作台     | 继续阅读、最近整理、待审关系和草稿箱                   |
| 知识库     | 论文与实体；表格、看板、画廊、列表、日历是论文内部视图 |
| 研究专题   | 研究范围、方法分支、阶段性理解、证据和已保存的比较组合 |
| 探索       | 全库检索、原文片段与以对象为起点的可缩放关系图         |
| 设置与维护 | 归档恢复、历史备份、AI 状态、属性配置与导入入口        |

全局“新建”可创建论文、实体、专题或导入 AI 草稿。⌘/Ctrl K 聚焦搜索。选择论文后进入比较；可把组合保存到专题并导出 Markdown / Awesome 条目。论文页提供研究速览、笔记目录、证据回查和 PDF/笔记并排阅读。关系探索支持拖拽、滚轮缩放、节点聚焦和来源检查器，让网页承担跨对象导航。外部插图需点击后加载。

论文库的“阅读桌”提供快速状态视图、文献列表和选中条目速览；“论文表格”用于批量属性、保存视图和 CSV。打开论文的“原文与笔记”后，可按 PDF 文件页码记录本地阅读问题；阅读记录只保存在当前浏览器，确认后再升级到正式 note 或 evidence。

编辑后保存直接写盘；列表、检索和关联读取同一主库。表格筛选可另存视图。论文与实体归档不删除记录，从编辑页恢复原 ID。自定义属性、公式和 rollup 在知识库属性面板，或设置的“AI 与属性”入口。

## AI 如何参与

仓库内三个入口：

- `$paper-knowledge-hub`：论文整理与入库。
- `$hub-entities`：实体消歧、来源和关系。
- `$hub-study`：专题分析、比较与材料输出。

```sh
npm run ai:prepare -- --paper PAPER_ID --out private/ai-drafts/PAPER_ID-context.json
npm run ai:draft -- private/ai-drafts/paper.json --collection papers
npm run ai:draft -- private/ai-drafts/paper.json --collection papers --stage
```

打开 `#/drafts`：阅读正文 → 查看来源和字段变化 → 修改草稿 → 确认 → 应用 → 打开记录。`ai:prepare` 会把逐页 PDF 文本、证据和八章模板整理成模型/Agent 上下文，`--stage` 保存草稿而不改变主库；过期草稿必须与当前记录重新合并。已有明确写入授权时也可使用 revision-aware CLI。完整格式见 [AI 工作流](docs/ai-workflows.md)。网页模型是独立可选能力，只接收经同意的公开证据；没有密钥不影响 Agent Skills 和本地功能。

## 当前本地样板

VLA 专题连接 RT-2、OpenVLA 和 Octo，比较动作表示、适配条件及实验边界。本轮示例复用已有 Octo 笔记与证据，通过草稿流程建立独立模型档案、补充笔记内部导航和待审关系；原有科学正文保留。草稿箱可回看已应用记录，专题和比较页可导出材料。这是资料组织示例，不是重新精读或实验复现。

## 数据与导出

`private/workspace.json` 是初始化后的权威主库；正文只在 paper.note。PDF、草稿、备份和本地导出都在 ignored `private/`。`content/` 只用于初始化前；生成文件和 dist 不手改。

浏览器导出包含当前本地内容。CLI 区分本地研究材料与公开子集：

```sh
npm run study:export -- --ids octo,openvla,rt-2 --out private/exports/vla-comparison.md
npm run export -- --format awesome --ids PAPER_ID  # 只导出公开投影
npm run package                                  # 干净源码包
```

源代码包不包含私有主库、PDF、密钥或本地截图，不能恢复私人资料；当前所有论文私有时，包初始化后为空库。完整恢复使用设置里的备份功能。待审草稿单独从草稿箱导出，尚未包含在主库备份中。

## 开发与验证

```sh
npm test
npm run test:e2e:v2
npm run build
```

共享布局在 src/ui.jsx，设计规范在 src/ui.css；领域页面保留现有数据接口，草稿调用同一个版本保护写入层。保留旧路由兼容，已移除公开模式的另一套浏览器存储编辑器与旧概览页。

设计参考：[Zotero 集合、条目与详情](https://www.zotero.org/support/quick_start_guide)、[shadcn Dashboard 工具栏与数据表](https://ui.shadcn.com/examples/dashboard)。只借鉴布局原则，不复制第三方代码或资源。

更多说明：[日常维护](docs/authoring.md) · [数据模型](docs/data-model.md) · [存储与恢复](docs/v2-storage.md) · [数据库能力](docs/database-workbench.md)。产品取舍和开源参考见 [研究工作台产品原则](docs/product-principles.md)。历史检查报告保留作版本证据，不作为当前操作入口。
