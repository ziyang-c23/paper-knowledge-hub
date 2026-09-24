# 四篇研究阅读样例

这些样例用真实论文检验同一阅读、比较和专题工作流。正文唯一来源是本地工作区各论文的 `note`；方法步骤、资源和实验条件由可选 `visuals` 字段驱动。初始化后不得用模板种子覆盖工作区。

| 论文与固定版本 | 本地入口 | PDF | 内容角色 |
|---|---|---:|---|
| Octo，arXiv 2405.12213v2 | [阅读](http://127.0.0.1:4176/#/paper/octo) | 17 页 | 跨机器人初始化、模块化接口、六域微调/泛化/消融 |
| 原始 OpenVLA，2406.09246v3 | [阅读](http://127.0.0.1:4176/#/paper/openvla) | 37 页 | 视觉融合、动作 token、目标域适配和效率实验变体 |
| RT-2，2307.15818v1 | [阅读](http://127.0.0.1:4176/#/paper/rt-2) | 26 页 | 视觉语言知识迁移、联合微调及新动力学失败 |
| Diffusion Policy，2303.04137v1 | [阅读](http://127.0.0.1:4176/#/paper/diffusion-policy) | 15 页 | 连续动作去噪、预测/执行窗口和真实 Push-T |

使用 `npm run build`、`npm run local` 打开完整工作台。上述入口需要本地工作区及已导入附件；新克隆不会凭空拥有私人工作区。公开投影目前仅含获准的 Octo 样例，其他三篇和综合专题保持私有；附带原始 PDF 不在公开构建中。

## 原始来源与阅读范围

- Octo：[原文](https://arxiv.org/pdf/2405.12213v2)、[项目](https://octo-models.github.io/)、[代码](https://github.com/octo-models/octo)。保留既有精读内容与 Abstract/Introduction/终章完整双语附录；按八章拆分正文，实验图区分 Table I、II/VI、VII。
- OpenVLA：[原文](https://arxiv.org/pdf/2406.09246v3)、[项目](https://openvla.github.io/)、[代码](https://github.com/openvla/openvla)、[模型](https://huggingface.co/openvla)。核对主文机制与实验、数据混合、任务评分和效率表脚注；没有把后续 OpenVLA-OFT 内容写入原始论文。效率实验采用较小混合、仅 SigLIP 的变体。
- RT-2：[原文](https://arxiv.org/pdf/2307.15818v1)、[项目](https://robotics-transformer2.github.io/)。核对主文、动作接口、实验配方、失败案例、Tables 4–6；论文未提供的分项试验数不反推，不以 6000 总试验数替代单组样本数。不填未确认的开放模型或训练代码。
- Diffusion Policy：[原文](https://arxiv.org/pdf/2303.04137v1)、[项目](https://diffusion-policy.cs.columbia.edu/)、[官方项目所链代码](https://github.com/columbia-ai-robotics/diffusion_policy)。核对主文、真实任务、评测协议和附录配置；v1 主文与附录的演示数/去噪步数差异留在附录，不擅自统一。

后三篇提供基于上述实际阅读的八章笔记及明确标为局部的双语关键摘录，不宣称已有全篇双语译文。PDF 文件身份与解析页数由导入接口记录；提取文本本身不是无误的表格或公式转录，也不是实验复现。官方项目和原始 PDF 已核对，未运行机器人模型。

## 从阅读走向比较

[三篇机制比较](http://127.0.0.1:4176/#/compare?ids=octo,openvla,rt-2&question=action)围绕 Octo、OpenVLA、RT-2 的动作接口组织。不同任务成功率不组成统一排行榜。

[动作生成接口专题](http://127.0.0.1:4176/#/topic/topic-action-interfaces)为私有整理视角，四篇均为成员，保存三篇比较并提供两条阅读路径：

1. Diffusion Policy 方法 → Octo 方法：共用条件动作扩散，但任务内模仿与跨机器人预训练的系统目标不同。
2. RT-2 方法 → OpenVLA 方法：共用离散动作接口，但基础模型、网页任务联合微调与开放适配条件不同。

[共享扩散方法](http://127.0.0.1:4176/#/entities/method-diffusion)连接 DP 与 Octo 的已核对方法关系；这不自动意味着论文之间有技术继承关系。专题包括可编辑综合判断、反例、比较边界及下一步材料需求。

## 复用模板

共同正文使用 `templates/paper-note.md` 的八章与共享 `NOTE_SECTIONS`。新增一篇时读取真实材料，通过工作区接口用当前 revision 合并记录，再用 `scripts/pdf.mjs` 附加 PDF。方法节点指向真实章节/原文；实验保留模型版本、任务、数据、适配、指标、单位和次数，不存在的值用缺失表示。

六域微调的逐项数据只在 Octo 的结构化实验记录维护，正文解释结果及口径。其余图文必须随来源版本一同核对，避免只改图表而保留过时论述。样例写入脚本和准备材料留在忽略的本地目录，不作为公开内容包提交。
