# V3 日常维护

本地服务 `npm run local` 默认运行在 `http://127.0.0.1:4176/`。首次初始化与 CLI 细节见 [存储手册](v2-storage.md)。已有 `private/workspace.json` 时，它是唯一权威主库；不要继续编辑 content 后期待本地页面变化。

## 新增与持续编辑

从全局“新建 → 论文与阅读笔记”填写稳定 ID、题名、年份、来源和作者；作者未知可以暂用空数组，其余必需字段满足 schema。先存 private/draft，再补笔记、研究问题、方法、评测协议和局限。阅读状态 unread/reading/reviewed 与生命周期 draft/active/archived 独立；reviewed 不表示复现成功。

详情的编辑入口用于日常补充。note 是唯一连续 Markdown 正文，支持表格、数学和代码；个人判断与未公开 idea 放在 personalAnalysis，始终不进入公开投影。编辑已公开内容默认改回 private，完成审查并重新勾选后才继续允许公开。

## 网页字段与笔记正文的分工

论文页的题名、作者、年份、版本和来源来自书目字段；研究速览与比较读取 `problem`、`method`、`conclusions`、`evaluation`、`limitations` 等字段；专题和研究配置读取 `topics`、`facets`。这些字段承担快速识别、筛选与比较，不需要在正文开头再复制书目卡、摘要表、分类清单或网页操作说明。

新笔记使用 [共享笔记结构](../src/lib/note-template.mjs) 的八章：论文概览、研究背景与问题定义、相关工作、方法、实验设计、实验结果与分析、局限性与讨论、附录。正文说明速览背后的理由：为什么提出问题、机制如何工作、实验怎样检验、结论依赖什么条件。短笔记可保留实际掌握的部分，不为凑章节补写未经核验的内容。

附录保存版本差异、阅读范围、原文定位、代码快照与未决疑点；已有双语附录、图注、公式、实验表格和数字条件保留在这一份正文中。个人假设使用 `personalAnalysis`；明确标注的公开作者讨论与方法分析仍可留在正文。旧八章笔记继续可读，不批量改写其他论文，也不以标题数量判断精读完成。

当前四篇八章样例与可复用图表说明见 [研究阅读样例](reading-workbench-examples.md)。`scripts/refactor-octo-note.mjs` 是此前五章展示的历史迁移，不用于当前八章正文；不要重复运行它覆盖现有笔记。正文与 `visuals` 的修改仍通过 `putRecord`、fresh revision 和备份保存，公开内容再通过 `sync:public` 派生。

JSON/Markdown 导入只填入编辑器，不自动落盘。JSON 使用标准单论文字段；同 ID、DOI/arXiv 或题名应合并已有记录，不能通过换 ID 制造重复。Markdown 只装入正文，不猜 front matter 或书目字段。保存后读取主库确认；遇到冲突先导出未保存修改，再重新读取并合并。

Agent/CLI 操作同样支持 dry run 和版本保护：

```sh
npm run workspace -- status
npm run workspace -- put private/paper-edit.json --revision REVISION
npm run workspace -- put private/paper-edit.json --revision REVISION --write
```

完整记录更新要保留未修改字段。保存后 revision 会变；下一次写入使用重新读取的版本。`npm run note:attach -- private/meta.json private/note.md private/ready.json` 可辅助装入正文，再用 workspace put，不再运行旧公开 importer。

## PDF 与证据

论文保存后在详情上传 PDF，或使用：

```sh
npm run pdf:import -- --paper PAPER_ID --file /absolute/path/paper.pdf
npm run pdf:import -- --paper PAPER_ID --file /absolute/path/paper.pdf --write
```

第一条预览，不读文件或下载；第二条保留原件并提取逐页文本。也可用受限的官方 arXiv PDF URL。原件和解析产物仅在 private/documents；正文、图表、公式及阅读顺序仍需人工对照。文件第 N 页不等于印刷页 N。

证据内容区分 source 作者原文/释义、note 整理者归纳、model 模型候选和 unverified 待核验。只有实际核对出处与支持范围后才标 verified；自动 PDF 文本不自动升级。不要编造页码、来源 URL 或实验结果。绑定本地原文时选择该论文已附加的文档和实际文件页；后端拒绝其他论文、未附加文档及超出范围页序。页序合法不代表主张已经得到原文支持。

## 分类、专题与关系

研究专题可直接新建/编辑；实体在知识库实体页维护；论文、实体详情的“整理关系”入口可编辑 evidence、relations，设置页保留兼容入口。多主题归属只维护 paper.topics；八个 facet 维度引用集中 concept ID，实体改名不要求逐篇改正文。别名用于检索和同义项提示，不代表自动消歧完成。

Topic.analysis 是人工阶段性综合，gaps 是“库内未覆盖/尚未理解”的问题，不是领域空白证明。evidenceIds 和 compareIds 连接具体证据与比较入口。

关系类型为 studies、uses、extends、related、cites。引用不等于采用，相关不等于扩展；approved 需要已核验证据及 source/curator 来源。model/similarity 先保留 pending，经人工修订来源与依据后再审核。所有新增/修改都有引用校验。

## 数据库属性

在 `#/database` 的“属性”面板中，普通属性保存个人整理值；公式和汇总属性只保存配置，结果在当前主库上即时计算。公式示例：`prop("year") - 2020`、`length(prop("tags"))`。汇总先建立“关联论文”属性，再选择计数、求和或平均等聚合和来源字段。派生结果不能在单元格中编辑，也不会写进 `customProperties`；若基础字段改变，重新读取后视图会自动显示新值。未知字段、循环公式和非数值求和会在保存时拒绝。

## 导出、归档与公开

浏览器下载的是当前本地视图材料，可能包含私有笔记，下载后由你控制去向。CLI export 则始终走公开字段和依赖过滤，不是私有全库备份：

```sh
npm run export -- --format awesome --ids PAPER_ID
npm run export -- --ids PAPER_ID --out comparison.md
npm run export -- --format json --out public-export.json
```

输出文件不覆盖已有文件，Awesome 条目不自动写入其他仓库。归档保留原数据和附件，并从默认列表、检索、图谱和公开构建排除。需要恢复时在归档列表打开原记录，不新建重复论文。

公开前审查 note 及结构化内容，确认论文、证据、分类和关系依赖的公开范围；然后 build。源码 ZIP 只含公开子集，完整库恢复使用维护页备份或 workspace backup。`demo:clear` 仅用于旧公开模板来源，不是本地主库清理工具；本地日常使用归档。

本地比较页也可导出 Awesome 待审条目，供人工选择后放入其他项目；不会写入目标 taxonomy 或推送。论文 Markdown 导出保留个人分析时明确标为本地判断，分享文件前须审查披露范围。

### 多源阅读素材与视觉叙事

`paper.note` 是唯一完整正文。`sources` 是多源材料的写入入口，旧 `sourceBundle` 仅兼容读取；`visuals` 承载方法步骤、实验与教学参数；`explanations` 保存局部补充解释；`media` 保存来源图与视频。`visualNarratives` 仅保留兼容，不为同一机制再写一套平行数据。字段格式以 schema 和真实 CLI 接口为准。新增来源、媒体、解释必须显式允许公开才进入投影，派生模块引用私有来源时仍被排除。

这些字段是 `note` 的补充，不替代原文、证据或研究速览。URL 必须是公开 HTTPS 地址；本地 PDF 链接在公开投影时会根据论文的 arXiv/DOI 来源转换，不能把 `private/` 路径写入公开记录。
