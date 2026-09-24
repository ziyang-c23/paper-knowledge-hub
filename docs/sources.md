# 示例语料来源与证据边界

核验日期：2026-09-23。全部 9 篇论文是真实公开论文；`demo: true` 表示它们是模板示例，不表示论文是虚构的。所有种子数据均重新依据公开来源撰写，未复制个人笔记、Notion 正文或附件。阅读状态是演示状态。

书目从 arXiv 页面 `citation_title`、完整 `citation_author` 序列、`citation_date` 和版本历史核验。`year` 使用第一次 arXiv 提交年份，不等于最终会议/期刊年份。作者数组保留网页的完整列表及顺序；Octo 的团体作者按原记录保留。笔记和 `abstract` 是新写的中文释义，不冒充原文摘要。

| 论文           | 已确认版本                                         | 首次年份 | 作者条目数 | 本轮阅读与核验范围                                          |
| -------------- | -------------------------------------------------- | -------: | ---------: | ----------------------------------------------------------- |
| DreamerV3      | [2301.04104v2](https://arxiv.org/abs/2301.04104v2) |     2023 |          4 | 摘要、Introduction、Learning algorithm、Results、Conclusion |
| Octo           | [2405.12213v2](https://arxiv.org/abs/2405.12213v2) |     2024 |         19 | 摘要与 §III-A Architecture / §III-C Training objective      |
| OpenVLA        | [2406.09246v3](https://arxiv.org/abs/2406.09246v3) |     2024 |         18 | 摘要、引言、§3 方法、§5 实验、§6 讨论；附录未完整审阅       |
| PaLM-E         | [2303.03378v1](https://arxiv.org/abs/2303.03378v1) |     2023 |         22 | 摘要与书目信息                                              |
| RT-1           | [2212.06817v2](https://arxiv.org/abs/2212.06817v2) |     2022 |         51 | 摘要与书目信息                                              |
| RT-2           | [2307.15818v1](https://arxiv.org/abs/2307.15818v1) |     2023 |         54 | 摘要、引言、§3 方法、§4 实验、§5 局限、§6 结论              |
| SayCan         | [2204.01691v2](https://arxiv.org/abs/2204.01691v2) |     2022 |         45 | 摘要与书目信息                                              |
| Transformer-XL | [1901.02860v3](https://arxiv.org/abs/1901.02860v3) |     2019 |          6 | 摘要与书目信息                                              |
| Voyager        | [2305.16291v2](https://arxiv.org/abs/2305.16291v2) |     2023 |          8 | 摘要与 §2.2 Skill Library                                   |

## 获取记录

所有下列请求均为 HTTPS 对 arXiv 的只读抓取。抓取 URL 使用不带版本的公开入口，返回文档/元信息确定上述版本；笔记和证据链接固定为该版本。这里只记录读取范围，不宣称检查了官方代码、权重可用性、项目页演示或复现实验。

- `dreamerv3` — 获取 [https://arxiv.org/abs/2301.04104](https://arxiv.org/abs/2301.04104)，2026-09-23；HTML SHA-256 `9b8279c15123de4ddb395d7b0333cfe29b8eadfcfe669550a97477fe9317ff1e`。
- `octo` — 获取 [https://arxiv.org/abs/2405.12213](https://arxiv.org/abs/2405.12213)，2026-09-23；HTML SHA-256 `6e9e93b9090faf6a8ff6e4f149da863af6c601c934ba4b6b6a9ad1b78e06e2cc`。
- `openvla` — 获取 [https://arxiv.org/abs/2406.09246](https://arxiv.org/abs/2406.09246)，2026-09-23；HTML SHA-256 `6eee376f1fe547b781dc37cf881690453e55929b51d7b3c00720f9c436228545`。
- `palm-e` — 获取 [https://arxiv.org/abs/2303.03378](https://arxiv.org/abs/2303.03378)，2026-09-23；HTML SHA-256 `32312ddf20f5de2d58e6a8da8f2d080f63c5f615a55826cd5ecf2b331d383ae4`。
- `rt-1` — 获取 [https://arxiv.org/abs/2212.06817](https://arxiv.org/abs/2212.06817)，2026-09-23；HTML SHA-256 `3481756943c4b0ef6fa67ecd757546a373d556a1f468143d8028f6fde59862fd`。
- `rt-2` — 获取 [https://arxiv.org/abs/2307.15818](https://arxiv.org/abs/2307.15818)，2026-09-23；HTML SHA-256 `44ca4597835076726fa8cdae294d10b6a5ab5847e68293c09ff349c502cbba9b`。
- `saycan` — 获取 [https://arxiv.org/abs/2204.01691](https://arxiv.org/abs/2204.01691)，2026-09-23；HTML SHA-256 `6d5f957d099eff18d25746ad9c1ed054c9a13afdf927c2c89de94399f09ccae9`。
- `transformer-xl` — 获取 [https://arxiv.org/abs/1901.02860](https://arxiv.org/abs/1901.02860)，2026-09-23；HTML SHA-256 `0bf71d901eb69fc8aae445b7c8339b6d5a9c4b5160282aeed352db45aa1b5c82`。
- `voyager` — 获取 [https://arxiv.org/abs/2305.16291](https://arxiv.org/abs/2305.16291)，2026-09-23；HTML SHA-256 `623da6dcf7bdc4c5fd8ec06df5fb3222e93df8529e058d8f44d3188253e961f6`。
- 主文读取 [https://arxiv.org/html/2307.15818](https://arxiv.org/html/2307.15818)，2026-09-23；HTML SHA-256 `7029c47cbce39692871f9e94ff1f54bf4e02a2aa382f998996deda89bc4d1656`。阅读范围见上表。
- 主文读取 [https://arxiv.org/html/2406.09246](https://arxiv.org/html/2406.09246)，2026-09-23；HTML SHA-256 `4140a5a011b44be7f3d79951b238452ed1a765fffefd9735b4824b136e3ebaf0`。阅读范围见上表。
- 主文读取 [https://arxiv.org/html/2301.04104](https://arxiv.org/html/2301.04104)，2026-09-23；HTML SHA-256 `7ce561853df3b35ccf0316476b3f7538b60117feb358bd562dc279f0d5067a26`。阅读范围见上表。
- 主文读取 [https://arxiv.org/html/2305.16291](https://arxiv.org/html/2305.16291)，2026-09-23；HTML SHA-256 `99535ed7540b1ddd2db5521bd471cd56dabdd59bc912681de3f85457e59007bc`。阅读范围见上表。
- 主文读取 [https://arxiv.org/html/2405.12213](https://arxiv.org/html/2405.12213)，2026-09-23；HTML SHA-256 `9a39cbbb66de7ff834ad4a91a564c3512ca9cf2be90bdcfad5719b3786b109aa`。阅读范围见上表。

个别初次请求超时；OpenVLA 全文与 PaLM-E 摘要页已重试取得完整 HTML。RT-1 的尝试性 HTML 抓取不完整，没有用它支持详细方法结论；Transformer-XL 的 HTML 请求未成功，采用已完整取得的摘要页。下载文件作为临时工作材料，未加入模板仓库；以上摘要页与 5 个采用的主文页均取得完整 HTML。

## 证据语义

- `kind: source, status: verified`：已读来源的中文释义，有真实 URL 与已核验的章节或 Abstract 定位。表示出处核验，不表示论文结论已独立复现。
- `kind: note, status: unverified`：明确署名为编者判断的分析或研究建议；相关论文链接只说明依据，不把建议升级为论文事实。
- `kind: model, status: unverified`：一条刻意设置的模型建议示例，展示待核验流程，不是真实系统跑出的科学发现。
- `origin: source` 的已接受方法边有相应方法或摘要证据。主题归属和相似讨论使用 `origin: curator`；并非作者声明的领域分类。
- `openvla → voyager` 是唯一 `origin: model, status: pending` 的候选边，必须与已接受知识分开。任何引用、相似度或共同主题都不自动产生 `uses` / `extends`。

Octo、RT-2、OpenVLA 与 DreamerV3 曾使用八节笔记结构；当前新模板采用八章网页笔记契约，旧笔记仍兼容读取，其余条目保持明确的摘要或章节阅读边界。3 个主题是可交互样例，不是穷尽综述：世界模型主题只有一个核心论文；Transformer-XL 是非机器人背景材料。公开 Pages 只展示经筛选的 Octo 示例；本地主库仍可包含其他私有论文和附件。所有图谱边均是模板数据，不能作为未经复核的自动综述结论。

## 维护方法

新增论文时先核对论文 ID、题名、作者、版本及首次年份，再补公开释义和证据。若只读摘要，保持导读范围；未取得原文的细节保持缺失。升级为已核验证据前记录实际读到的位置。新版本或代码结果用新的核验记录说明变化，不能把代码运行、项目页演示和论文主张混成同一个证据类型。
