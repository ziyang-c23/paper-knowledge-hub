# V1 历史验收记录

本文件保留 V1 当时的验收证据，描述和数字不代表 V2 当前状态。当前实施与验收见 [V2 审计](v2-audit.md) 和 [V2 独立复审](v2-independent-review.md)。

日期：2026-09-23；环境：macOS Apple Silicon，Node 24.7.0，npm 11.19.1，React 19.3.0，Vite 7.3.6，Playwright 1.63.0 / Chromium 153。依赖来自锁文件。所有验收都在独立新项目或隔离测试副本完成，未修改原有 Awesome 或个人文献库。

## 已完成的检查

| 检查 | 命令 / 方法 | 实际结果 |
|---|---|---|
| 安装与锁文件 | npm install；后续源码包 npm ci 见下 | 已安装并生成 package-lock；安装时 audit 报 0 vulnerabilities（只代表当时 registry advisory 查询） |
| schema / ID / 引用 | npm run validate | 9 篇真实论文通过；3 topics、10 concepts、21 evidence、28 relations，其中 27 approved、1 pending |
| 核心测试 | npm test | 27/27 通过：schema、搜索、图扩展、隐私投影、原始公开文件 privateNotes 拒绝、导入幂等/冲突/回滚、示例保护、导出、网关契约 |
| 可发布构建 | npm run build | 成功生成 dist，资源相对路径；无源映射或私有目录复制 |
| 前端代码格式 | npm run format:check | 通过 |
| 本机开发运行 | npm run dev -- --port 5173；Codex 内浏览器真实访问 | 首页已打开并实际目视检查 |
| 浏览器验收 | npm run test:e2e | 8/8 通过，详见场景表；真实 Chromium，无测试伪造截图 |
| 示例清理预检查 | npm run demo:clear | 仅报告 71 个未改动示例对象；实际交付库未清空。清理/回滚保护由临时目录测试执行 |
| Awesome 导出 | npm run export -- --format awesome --ids openvla,rt-2 | 输出真实论文元信息 Markdown bullets，不覆盖任何已有仓库 |
| Git 排除 | git check-ignore private/example.json .env src/generated/public.json dist/index.html | 全部忽略；本地独立 Git 仓库，无 commit / remote / push |
| 独立复审 | 数据工程子 Agent 在 UI/文档完成后只读复核 | 发现及修复记录见 review.md；不是安全认证或重复的自我宣称 |

## 浏览器场景（tests/e2e/workflows.spec.js）

| 场景 | 覆盖与观察 |
|---|---|
| A 找论文 | 英文 VLA、中文“记忆”、作者 Moo Jin Kim；年份+状态组合、计数、无结果、清空、刷新恢复 URL；首页 27 条关系数字进入全库 27 条关系 |
| B 跨论文比较 | 选择 OpenVLA/RT-2/DreamerV3；表格与评测条件、未知字段；实际下载 Markdown 并回读标题、维度和来源 |
| C 关系和证据 | 详情 hash 直接访问/刷新；节点键盘 Enter、边检查器、边转节点、证据定位；待审关系独立；无关系空状态；下载笔记回读证据类型/状态/缺失来源，实际复制引用 |
| D 浏览器维护 | 合成草稿填写、localStorage 保存、刷新、导出 private JSON 并回读、清空；没有冒充主库持久写入 |
| D/E 完整新增与隐私 | 在隔离项目导入 TEST ONLY paper/evidence/relation；dry run → 写入 → 重复导入 → build:data / Vite build；统计 9→10，列表/详情/搜索/关系实际出现；公式、表格、代码渲染；整个 dist 及生成 JSON 扫描假私有 marker 和假密钥均不存在 |
| E 基础查询 | OpenVLA 3 个直接片段、扩展后 7 个结果；无结果不生成答案；没有模型配置保持基础检索；畸形详情 URL 不崩溃 |
| F 发布页面质量 | 严格静态服务器挂载 /paper-knowledge-hub/，无 SPA fallback；页面/资源无意外 4xx，详情刷新可用；390×844 窄屏各页无整页横向溢出；Tab/跳转主内容；根字号放大检查；无 pageerror |
| 模型 UI 契约 | mock-only：同意前按钮不可用，filters 真正送出，远程图片不加载，旧查询请求不进入新查询结果。网关 API 契约还测无配置/坏参数/同源/超时/上游错误/无证据/缺失与未知引用 |

截图保存在 artifacts/screenshots/：overview、paper-detail、relations、comparison、evidence-query、mobile，另有 overview-viewport 便于快速查看。截图为运行中页面，未生成或替换界面图。

## 发现、修复与重测

- 初次 E2E 无对应 Chromium，全部未执行：安装官方 Playwright Chromium 后重跑。
- 路由写 location.hash 后受控 checkbox 短暂恢复旧值：改为同步发布路由状态，重测关系扩展操作通过。
- 隔离新增测试断言误用 stable ID 作为显示标题：改为检查真实显示 title 和证据 ID，功能未伪造满足测试。
- 静态审查发现作者搜索、简称碎词误命中、最小 topic 默认数组、公开 privateNotes 源文件泄露风险、bundle 版本/字段忽略问题，逐项修复并有核心回归。
- UI 集成审查发现模型 filter 丢失、旧请求竞态、远程图片加载、异常 hash、ID 正则不一致、导出格式描述错误、拒绝关系标签和证据导出错误归因，均已修复；证据导出有下载回读断言。
- 图中箭头原本被节点遮住：边裁剪到节点边界；全页截图原本带滚动偏移，拍摄前回到页首，重新获取真实截图。

## 源码包与干净安装

已实际生成 `artifacts/paper-knowledge-hub-source.zip`，ZIP CRC 校验通过，并检查路径允许列表包含 .gitignore / GitHub workflows，排除 .git、private、.env、node_modules、dist、src/generated。

将源码包解压到全新系统临时目录，未链接原项目 node_modules，执行 `npm ci && npm run validate && npm run build` 全部通过。62 个静态文件逐一 SHA-256 对比，与原项目 dist 字节一致。后续交接文档和截图更新不改变应用构建结果；最终重新打包并回读。

补充 smoke：`npm run note:attach -- templates/paper-minimal.json templates/paper-note.md <临时输出>` 成功，将 380 字符 Markdown 装入单一 note，输出通过 schema 校验。README / AGENTS / docs 的相对链接检查无错误。

最后补拍关系图：第一次 focused grep 使用不匹配的 `^C:`，没有运行用例；改为 `C: Detail` 后 1/1 通过，截图等待短暂引用提示消失。此前完整 8/8 结果未用这个单例结果替代。

最终静态预览 `npm run preview -- --port 4173` 返回正常 HTML，并在 Codex 内浏览器实际打开。原开发标签因开发服务重启出现临时连接错误，已切换到静态版本重新检查；不把失效标签作为交付入口。

## 明确没有验证的项目

- 没有模型凭据：未调用真实模型，mock 契约不代表提供方联通或模型质量。
- 没有指定远程账号/仓库可见性：未创建远程仓库、未提交/推送，未运行 GitHub Actions 或真实 Pages 部署；没有在线 URL。
- 未在 Windows 实机、Firefox/Safari 自动化、全套屏幕阅读器或大型语料负载上验证；代码尽量跨平台但不作已验证声明。
- 未解析 PDF 全文、运行论文模型、核验论文实验成绩、实现自动 GraphRAG 或测量图增强效果提升。
- 当前库仅索引公开内容。private/ 是受保护的草稿存储，不是已经实现的私有库浏览功能。
