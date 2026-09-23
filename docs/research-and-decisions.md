# 技术路线、来源核验与取舍

本模板选择 **React + Vite 静态 hash SPA、JSON 元数据与 Markdown 正文、可选本地 Node 模型网关**。目标是交付能放进 GitHub 仓库的源码模板和可交互示例，支持 GitHub Pages。没有创建 Sites 项目，也没有把运行需要的服务绑定到 Sites 平台。

核验日期：2026-09-23。下文区分官方文档说明、GitHub API 快照、本地已安装依赖和本项目的工程判断。它不是各工具的完整市场调研，仓库活跃信息也不是未来维护承诺。

## 三条可行路线

| 路线 | 官方已具备的基础 | 对本任务的收益 | 需要承担的工作 | 结论 |
|---|---|---|---|---|
| React + Vite 静态应用 | Vite 构建静态 `dist`，官方提供 GitHub Pages 部署方式 | 筛选、比较、图谱和证据面板可以共享浏览器状态；源码结构小，静态部署明确 | 内容 schema、搜索、图谱约束、路由与可访问性需要自行实现；hash 页面不以搜索引擎收录为主要优势 | **当前实现**。优先满足交互式知识库工作台 |
| Astro content collections + 交互组件 | collection loaders 可读本地 Markdown/JSON；schema、引用、静态路由和模板渲染 | 内容型网站、独立文章 HTML、搜索引擎收录和大篇幅阅读更自然 | 跨页面比较与关联检索的客户端状态仍需设计；动态组件与内容构建的边界需要额外组织 | 若正式公开文章阅读/SEO 成为首要目标，值得迁移 |
| Quartz Markdown 知识花园 | 官方列出全文搜索、graph view、wikilinks、backlinks、transclusions、LaTeX、Obsidian 兼容 | 已有大量 Markdown 双链笔记时可快速得到阅读与导航网站 | 本任务要求有类型关系、证据状态、私有字段剔除、横向比较和模型网关；仍需自定义数据层与界面 | 适合以双链写作为主的库；没有直接拿链接图冒充证据知识图谱 |

上述取舍是针对本模板的工程判断，不是说某条路线做不到其他功能。Quartz 和 Astro 都可以扩展，但当前功能组合更接近一个小型交互应用。

官方阅读来源与范围：

- [Vite — Deploying a Static Site](https://vite.dev/guide/static-deploy)：核验 `dist`、本地预览和 GitHub Pages 的 base / GitHub Actions 部署说明。
- [Astro — Content collections](https://docs.astro.build/en/guides/content-collections/)：核验本地 Markdown/JSON 集合、loader、schema、引用查询及静态内容路由；没有测试 Astro 原型。
- [Quartz — 官方首页](https://quartz.jzhao.xyz/)：核验 Markdown 静态站点定位及官方列出的搜索、图谱、双链和数学功能；没有运行 Quartz 或审计插件兼容性。

这些是阅读时的滚动文档，不据此声称本项目使用了官网显示的最新版本。下面的依赖版本来自本地实际安装包。

## 本项目的具体决定

1. **数据以文件为中心。** 一篇论文只有 `content/papers/<id>.json` 一份权威对象；其中 `note` 是 Markdown 正文。独立 JSON 保存主题、概念、证据和关系。这样书目、主题归属、证据与正文能够一起经过 Git 审阅和 schema 检查。缺点是直接编辑很长 JSON 内的 Markdown 不如独立 `.md` 方便；当前导入器只处理 schema v1 JSON，不冒充已有库的通用 Markdown/BibTeX 迁移器。
2. **hash 路由适配静态托管。** 路径形如 `#/paper/openvla`，页面刷新访问同一个入口 HTML；`vite.config.js` 使用相对资源基址 `./`。这是本模板的一种选择，不是照搬 Vite 文档的唯一推荐配置。GitHub Pages 部署仍要由仓库管理员启用并实际执行工作流；拥有本地 `dist` 不是已经发布。
3. **公开构建先做数据投影。** `scripts/data.mjs` 校验内容与引用并按字段白名单构建公开数据。它是发布边界，不是用户认证或文件加密；已经写进公开正文的私密信息不会因字段白名单自动消失。原始私人记录应留在 `private/` 或原私有库。
4. **检索先做确定性实现。** `src/lib/knowledge.mjs` 做文本规范化、字段/证据匹配、筛选以及有限跳数的关系扩展。该实现不是向量搜索，不使用预训练 embedding，不宣称 BM25/中文分词或语义召回性能。完全匹配、多关键词和别名行为可通过本地测试复核；语言改写和同义词仍可能漏检。
5. **知识关系必须有出处。** 图查询只采纳公开、已接受、有已核验证据的关系；模型建议与相似度候选不进入已接受图。方法采用、研究对象、主题整理和编者关联分别记录。引用某篇论文不推出采用了它的机制。
6. **模型调用放在 Node 服务端。** `services/server.mjs` 默认绑定 `127.0.0.1`，提供同源页面与 `/api/ask`；`services/model-adapter.mjs` 从环境读取 key/base URL/model。只有用户同意后发送问题及筛出的公开证据，浏览器和静态构建不包含 key。GitHub Pages 本身不运行这个网关。当前接口是通用 chat-completions 兼容适配，不是对某家服务可用性的认证。
7. **引用检查不是事实验证。** 网关拒绝缺少引用或引用未知 ID 的回答，但不能仅靠 ID 检查判断每条生成结论都被证据支持。UI 应保留证据回查，并把模型输出与来源释义分开；未配置模型时，本地检索仍可用。

代码阅读范围：数据/图谱与检索核心、当前导入器、Vite 配置、本地 HTTP 服务和模型 adapter。这里没有据此声称完成浏览器验收、线上部署或真实模型供应商调用；这些应由对应测试和验收记录单独报告。

## 为什么目前不引入完整 GraphRAG

当前示例只有 9 篇论文，21 条证据和 28 条关系。能解决的问题是把“哪些证据直接命中”和“哪些论文经已核验关系扩展而来”显示清楚。全量实体抽取、关系合并、社区发现、社区摘要、向量索引和图数据库会增加维护成本，还会引入自动抽取关系的误差；图数据库本身不提高来源可信度。

这里应称为**证据检索 + 有限关系扩展 + 可选模型回答**。它不等同于完整 GraphRAG，也不是论文内容已自动结构化完成。前端图形只是已维护关系的呈现。

升级以测量结果为准，以下是建议门槛，不是已测性能承诺：

| 观察到的问题 | 先测什么 | 再增加什么 |
|---|---|---|
| 用户经常用改写或中英同义词查询，相关论文没命中 | 建立带相关证据标注的真实查询集，报告 recall@k；区分分词问题与语义问题 | 先同义词/分词与词法排名，再考虑 embedding + 混合检索 |
| 公开 JSON 和全文让低端设备首次加载或检索明显变慢 | 在目标设备记录 payload、初始化时间、p95 查询延迟；可把 300 ms 本地查询延迟作为初始体验预算 | 预构建倒排索引、按需加载正文、Web Worker；仍不足时再考虑检索服务 |
| 关系数量和编辑人数让去重、版本、引用修复难以管理 | 统计关系冲突、无证据候选比例和人工审阅成本 | 数据库存储、审核队列、实体消歧；不先假定一定需要图数据库 |
| 需要全库级趋势或跨主题综合，普通 top-k 证据频繁漏掉关键子群 | 用代表性综合问题比较覆盖率、引用正确率、延迟及费用 | 试验分层摘要/社区检索；保留原证据和人工确认，再决定是否采用完整 GraphRAG |
| 需要多人在线编辑、访问控制、私有全文检索 | 明确身份、授权范围、审计和备份要求 | 独立后端与数据库；当前静态 Pages + localhost 网关不覆盖该场景 |

先保留 schema 和稳定 ID，可让未来索引/数据库成为派生层，避免一次升级产生两套互相冲突的正文权威。

## 仓库活跃度与许可证：本轮实查

公开 GitHub API 返回的时间均为 UTC。`pushed_at` 是最近推送，不等于最近正式 release；本轮没有审计 release 兼容性或维护响应时间。下表请求于 2026-09-23。

| 仓库（API 确认 canonical） | 最近 push UTC | archived / disabled | 默认分支 | LICENSE 读取结论 |
|---|---|---|---|---|
| [react/react](https://github.com/react/react) | `2026-09-22T17:36:10Z` | `false / false` | `main` | [MIT（已读 LICENSE 原文）](https://github.com/react/react/blob/main/LICENSE) |
| [vitejs/vite](https://github.com/vitejs/vite) | `2026-09-22T11:20:23Z` | `false / false` | `main` | [MIT（已读 LICENSE 原文）](https://github.com/vitejs/vite/blob/main/LICENSE) |
| [withastro/astro](https://github.com/withastro/astro) | `2026-09-22T14:34:39Z` | `false / false` | `main` | [MIT；文件另含源自 SvelteKit/Vite 的 MIT 声明。API SPDX 为 NOASSERTION，未直接当作无许可证。](https://github.com/withastro/astro/blob/main/LICENSE) |
| [jackyzha0/quartz](https://github.com/jackyzha0/quartz) | `2026-09-20T20:17:23Z` | `false / false` | `v5` | [MIT（已读 LICENSE 原文）](https://github.com/jackyzha0/quartz/blob/v5/LICENSE.txt) |

React 查询从 `https://api.github.com/repos/facebook/react` 跟随重定向后返回 `react/react`；这里使用返回的 canonical 名称。API 请求路径分别为 `https://api.github.com/repos/<owner>/<repo>` 和其 `/license`。许可证按返回的 base64 正文解码检查，不只看 API 的 SPDX 标签。

LICENSE 文件 Git blob SHA（可用于复核本次读取的文件，不是仓库 HEAD）：

- react: `b93be90515ccd0b9daedaa589e42bf5929693f1f`，仓库路径 `LICENSE`。
- vite: `b7e97ecb6aa4dd70b3e3a637afa2ae16feb7cd12`，仓库路径 `LICENSE`。
- astro: `b3cd0c0f0e01d20109fc8660a4d6b7dc9a22bc49`，仓库路径 `LICENSE`。
- quartz: `147e2ca14b0fd6d36ed3ab3112e6c6e2de0a3f68`，仓库路径 `LICENSE.txt`。

## 实际安装的直接依赖

以下版本与 `license` 字段读取自本地 `node_modules/<package>/package.json`，不是“最新版本”声明。生产/开发范围按本项目 `package.json`。本轮也直接读取了 React、React DOM、Vite、KaTeX、Lucide、Ajv、react-markdown 和 remark-gfm 的本地 LICENSE 文件；remark-math / rehype-katex 此处按包元数据记录，未完成全传递依赖许可证审计。

| 包 | 本地安装版本 | 许可证声明 | 用途 |
|---|---|---|---|
| `ajv` | `8.20.0` | `MIT` | 运行/内容构建直接依赖 |
| `react` | `19.3.0` | `MIT` | 运行/内容构建直接依赖 |
| `react-dom` | `19.3.0` | `MIT` | 运行/内容构建直接依赖 |
| `react-markdown` | `10.1.0` | `MIT` | 运行/内容构建直接依赖 |
| `remark-gfm` | `4.0.1` | `MIT` | 运行/内容构建直接依赖 |
| `remark-math` | `6.0.0` | `MIT` | 运行/内容构建直接依赖 |
| `rehype-katex` | `7.0.1` | `MIT` | 运行/内容构建直接依赖 |
| `katex` | `0.16.47` | `MIT` | 运行/内容构建直接依赖 |
| `lucide-react` | `0.468.0` | `ISC` | 运行/内容构建直接依赖 |
| `@playwright/test` | `1.63.0` | `Apache-2.0` | 开发/构建或测试 |
| `vite` | `7.3.6` | `MIT` | 开发/构建或测试 |

Lucide 的 ISC 文件明确保留 Feather 来源的 MIT 部分说明；分发时不要删掉该继承声明。Vite 的分发 LICENSE 含捆绑依赖声明，不能只保留自己项目的一段 MIT 文本。KaTeX 软件、字体和其他静态资产应保留分发中要求的说明。测试依赖 Playwright 是 Apache-2.0；它的测试工具许可证不代表示例论文、图或 PDF 的许可。

项目自身许可证只覆盖作者有权授予的模板内容。论文标题、作者和来源链接用于书目索引；笔记是新写的释义，本模板不打包论文 PDF 或原论文图像。公开可读不自动等于可以重新分发全文和图片。

## 审计边界与后续维护

这份文件记录了一次有限、来源可回查的选择：3 份官方文档、4 个仓库的 live metadata / LICENSE、当前直接依赖元数据与相关实现代码。没有声称执行了供应链安全审计或穷尽许可证审查。部署前按锁文件安装、运行仓库检查，并以实际测试记录判断可用性；后续更新依赖时重新检查运行要求、许可证和构建结果。

集成阶段增加的开发工具：Prettier（MIT，用于可维护源码格式）与 fflate（MIT，用于跨平台源码 ZIP，不进入浏览器运行时）。精确锁定版本及许可正文见 package-lock.json 与 THIRD-PARTY-NOTICES.md。这两个工具不引入额外运行服务。
