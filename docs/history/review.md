# V1 历史实现审查记录

本文件保留 V1 当时的验收证据，描述和数字不代表 V2 当前状态。当前实施与验收见 [V2 审计](v2-audit.md) 和 [V2 独立复审](v2-independent-review.md)。

本记录审查数据管线、导入器、公开投影、可选模型网关，以及它们与 `src/main.jsx` 的静态集成。审查者没有修改前端。此前问题已按最后一次实际源码复核更新；新增问题有明确状态。代码审查不等于浏览器验收、真实模型调用或安全审计认证。

## 已修复并有回归检查

| 问题 | 修复 | 检查 |
| --- | --- | --- |
| 只从生成物移除 `privateNotes`，无法阻止其进入 Git 原始公开文件 | `loadData` 与 importer 拒绝非空 `privateNotes`，指向 ignored `private/`；纯投影仍有剔除兜底 | `tests/integration/import.test.mjs`；`tests/unit/knowledge.test.mjs` |
| 私有论文或证据可能由公开关系间接暴露 | 字段 allowlist、实体可见性、证据归属和关系依赖过滤 | 私有 marker、private supporting evidence 测试 |
| 作者搜索未进入文本索引 | 作者名加入标准化检索 | author AND-search 测试 |
| 最近更新排序不生效 | 更新日期降序，其次年份，缺失更新日期排后 | updated-sort 测试 |
| `RT-2` 被拆为短 token 后误匹配作者及年份 | 精确已知 ID、标题、简称或别名按完整标准化词组匹配；`RT 2` 与 `RT-2` 等价 | known RT-2 alias 测试，包括真正提到该名称的其他论文 |
| 导入 bundle 的未知 schemaVersion / 顶层键可能被合并阶段忽略 | 写入前拒绝不支持的版本及未知 envelope 键 | importer envelope 测试 |
| schema-valid 最小 topic 缺少数组，前端 `.map()` 可能崩溃 | 公开投影补全空 dimensions、branches、questions 与文字字段 | minimal-topic default 测试 |
| 导入批次存在坏引用或重复身份时可能产生部分内容 | 全批 preflight；硬链接发布不覆盖文件；运行时失败回滚本次发布文件 | import atomic-preflight / idempotency / conflict 测试 |
| 清空示例可能删除用户改动或破坏引用 | 校验 seed manifest 字节哈希与剩余引用；默认 dry run，实际移动到可恢复备份 | demo modified/reference/backup 测试 |

导入事务保护普通运行时失败，**不声称对进程崩溃或断电提供多文件数据库级原子提交**。公开字段的正文仍需人工审查；不能自动识别用户写进 `note` 的敏感文字。

## 前端与网关集成复核

已重新读取当前 `src/main.jsx`、网关、schema、导入导出脚本及测试。此前发现的状态已按实际代码更新；审查没有修改前端。

| 原问题 | 当前状态 | 当前实现与验证依据 |
| --- | --- | --- |
| 模型回答自动加载远程图片 | 已修复 | `Md` 将 img 替换为文字占位；浏览器 model UI contract 检查 img 数量为 0，原始 HTML 未启用 |
| 模型检索忽略当前筛选 | 已修复 | 客户端发送 topic/year/status/relationType；网关验证并应用相同 filters，返回实际 evidence；gateway 与 UI contract 均覆盖 |
| 旧答案出现在新查询下 | 已修复 | AbortController 加 activeRequest 引用检查；切换查询参数取消请求并清空结果；浏览器用延迟 mock 检查切换后不展示旧回答 |
| Awesome 导出文案与实际格式不同 | 已修复 | 页面命令显式含 `--format awesome`；CLI 对应输出 README bullet，默认 markdown 保持比较表；CLI 回归覆盖 |
| 畸形百分号路由触发 decode 异常 | 已修复 | PaperPage 按稳定 ID 原样查找，不再 decodeURIComponent；E2E `#/paper/%invalid` 显示论文不存在 |
| 草稿 ID 允许尾部 / 连续连字符 | 已修复 | HTML pattern 与导出前正则都采用 `[a-z0-9]+(?:-[a-z0-9]+)*` |
| SVG 非法 height 属性 | 已修复 | 当前节点矩形 `height="64"`；箭头端点及截图审查由集成负责人继续负责 |

## 最终复核的新发现

| 严重度 | 状态 | 触发与影响 | 最小修复 |
| --- | --- | --- | --- |
| P2 | 已修复并回读源码 | 笔记导出已保留 evidence.kind/status；无 e.url 时写明“未提供来源（不可视为原文支持）”，不再回填论文 URL | E2E 下载后读取 Markdown，断言模型辅助 / 待核验与未提供来源；最终执行由集成负责人统一记录 |
| P2 | 已修复并回读源码 | PaperPage / ConceptPage 与关系检查器统一使用 reviewLabels：approved 已审核、pending 待审核、rejected 已拒绝 | 已确认映射实际用于显示；rejected 仍不参与图扩展 |

## 已检查的网关边界

- 只监听 loopback；校验 Host 与浏览器 Origin；POST 必须 JSON 和 `consent: true`。
- 请求正文、问题、并发、模型响应大小与超时有界；不向客户端回传上游原始错误正文。
- `GET /api/status` 只返回 configured 布尔值。configured 表示配置完整，不表示连接成功。
- 模型输入来自公开投影，仅使用 `verified` 且 kind 为 source/note 的 evidence；不读取 private/ 或向前端注入密钥。
- 回答必须包含已发送 evidence ID，未知引用或无引用会被拒绝。该检查不证明每个主张受到证据支持。
- 模型协议测试使用明确标记的 mock 响应；没有真实提供方凭据验证。

## 检查结果与后续验收

本轮最终相关测试：`node --test tests/unit/*.test.mjs tests/integration/import.test.mjs tests/integration/query-examples.test.mjs`，**18/18 通过**。更早的完整套件曾 20/20 通过；增加检查后由集成负责人再运行完整套件与浏览器测试，本记录不预先宣称其结果。

真实数据查询示例见 [query-examples.md](../query-examples.md)。图扩展只证明增加了已确认邻居，不证明检索或答案质量提升。尚无向量索引、embedding、全量 GraphRAG、PDF 全文索引、Notion 同步或领域完备性保证。

## 本轮服务端补充验证

`node --test tests/integration/gateway.test.mjs tests/integration/export.test.mjs`：**7/7 通过**。网关测试验证筛选确实限制发送 evidence、错误筛选在调用模型前被拒绝、无证据不调用模型；全部为 mock 提供方协议测试。引用检查测试覆盖无引用，以及有效 ID 与未知 ID 混合出现：均拒绝整段答案，不会退回显示未经检查的回答。

导出命令的确定含义：

```bash
# 默认：Markdown 比较表
npm run export -- --ids openvla,rt-2
# 显式相同输出
npm run export -- --format markdown --ids openvla,rt-2
# README / Awesome List 条目，只含公开元数据
npm run export -- --format awesome --ids openvla,rt-2
# 全库公开 JSON 快照
npm run export -- --format json
```

`--out <新文件>` 写入使用不覆盖模式。导出不会修改外部 Awesome List 仓库；条目分类和纳入仍需人工审核。

## 最小数据、关系与源码包复核

- 公开投影补齐 Paper.status/topics/tags/aliases/note/abstract 以及 Topic 的数组字段；最小合法 topic 不再导致页面 `.map()` 崩溃。空库的统计分母、空图起点与缺失详情都有保护。此项为源码检查加现有最小数据单元测试，不冒充额外浏览器运行。
- `validateData` 禁止 model/unverified evidence 直接标成 verified；approved 关系要求 verified evidence 且 origin 不得是 model/similarity。图遍历再次检查这些约束；前端 pending 候选独立展示，模型网关仅发送 verified source/note。
- 重新阅读 E2E 的独立临时库测试：导入、重复导入、重建、计数、笔记/公式/表格、查询、图关联和 dist 私有 marker 扫描均有断言。复核时 `test-results/.last-run.json` 为 passed / failedTests=[]；本次没有重复运行完整套件，具体最终数量以验收记录为准。
- `scripts/package.mjs` 使用根路径 allowlist，跳过 generated/node_modules/.git/private/dist/tmp/test-results/playwright-report；拒绝符号链接；遇非 `.env.example` 环境文件失败；只递归收录明确公开目录。`artifacts/` 仅允许 screenshots，避免套入旧 ZIP 或临时输出。
- 复核时源码 ZIP 尚未生成，因此此处只确认打包代码边界，**不声称已读回最终 ZIP**。测试目录含明确标记的虚构私有 marker / 假密钥用于回归，这是测试材料，不是用户秘密。源码中的正文与截图仍需人工确认公开范围。
- 未发现前端密钥字段或自动模型调用；真实提供方凭据不可用，所有模型测试保持 mock 标识。

## 集成负责人补充：发布包验收

独立审查之后，负责人实际生成 ZIP、执行 CRC/路径允许列表回读，并在独立解压目录 npm ci / validate / build 成功；62 个静态产物与工作目录构建逐文件哈希一致。见 verification.md。该补充与上文审查当时的只读范围分开记录。
