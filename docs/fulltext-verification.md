# PDF 原文入库与定位：已验证范围

本轮用两份公开论文原文验证本地附件链路，未读取用户其他私有资料。原文和解析 JSON 留在忽略的 `private/documents/`；源码包不含它们。网页导入只写本机库，不上传模型、不自动公开。

## 来源与身份

| 论文 | 官方取得地址 | SHA-256 | 文件页数 | 稳定文档 ID |
| --- | --- | --- | --- | --- |
| OpenVLA v3 | https://arxiv.org/pdf/2406.09246v3 | `353c37df34458f12f969b14dfd8b77175b727b9cddea7bb891759beddeefe1be` | 37 | `doc-6146d22b2deb83a754c130762f354c28` |
| Octo v2 | https://arxiv.org/pdf/2405.12213v2 | `73bff297cfafe523319162124e6b7f96919c0930e0a380f307255c4c7464ac93` | 17 | `doc-1a657306ca866f04d56514d46a5cdcc1` |

2026-09-23 下载。运行时解析器 `pdfjs-dist/6.3.289`，无云服务。54 个文件页逐页提取文字。`pageIndex` 从 1 起，`pageLabel` 固定为 `File page N`；链接 `/api/documents/<id>/file#page=N` 使用 PDF 文件页序，未推断论文印刷页码。ID 由论文稳定 ID 与文件 SHA-256 派生；相同文件重新解析不改变 ID，换文件版本产生新 ID，旧引用不被静默重定向。

## 实际页面与提取检查

使用 Poppler `pdftoppm -f N -l N -r 90 -png -singlefile` 渲染，并查看完整页面，与页文本对照。这里只核验下列页与相应文字，不宣称逐页阅读 54 页，也不宣称自动还原了表格。

| 原文文件页 | 代表特征与实际观察 | 可用范围与限制 |
| --- | --- | --- |
| OpenVLA 10 | §5.3/§5.4、Table 1/2、Figure 6 与底部脚注。文字包含 LoRA rank、frozen vision、quantization。 | 可定位相关段落；浮动表与正文提取顺序不同。脚注 4 明确此处实验使用较小数据混合及 SigLIP-only 模型，不能把显存/成功率直接泛化到所有 OpenVLA 设置。图中柱高不进入文字证据。 |
| OpenVLA 21 | Appendix A 的数据混合 Table 3；Appendix B 的评估说明与 DROID 脚注。 | DROID 行与“最后三分之一训练移除”的脚注可寻址；自动表格单元格关系未经验证，不从提取文本计算或重新比较各行数字。 |
| Octo 4 | 双栏、任务/观测 tokenizers、readout tokens、符号公式及训练数据饼图。 | 常规段落可检索；数学括号/下标出现控制字形，保留 `control-characters-or-math-glyphs` 标记；图例混入流式文字，不作为饼图数据读取结果。 |
| Octo 15 | 双栏、Table V、Appendix E（history/action chunking/shuffle buffer/gripper）和 Appendix F。 | 文字提供针对特定测试的观察与限制；两栏正文整体可读，但表格/公式仍保持 unchecked；不能把作者的特定任务结果改写成普遍结论。 |

所有页默认显示 `reading-order-unverified`、`tables-unchecked`、`formulas-unchecked`、`figures-not-extracted`。文字少于 80 字符提示 `sparse-text-or-scanned-page-no-ocr`。没有 OCR、版面模型、表格结构提取或公式语义解析。匹配片段是查找入口，尚未审核的解析文本不会自动成为 verified evidence。要使用表格数字或公式，请打开原页核对，并手工建立带 `documentId`、`pageIndex`、`quote` 的证据记录。

## 可复现使用

先建立本机主库（已有库不会覆盖），确保 paper ID 已存在：

```sh
npm run workspace -- init --write
node scripts/pdf.mjs --paper openvla --url https://arxiv.org/pdf/2406.09246v3
node scripts/pdf.mjs --paper openvla --url https://arxiv.org/pdf/2406.09246v3 --write
node scripts/pdf.mjs --paper octo --url https://arxiv.org/pdf/2405.12213v2 --write
# 或选择合法可用的本地文件
node scripts/pdf.mjs --paper openvla --file /absolute/path/openvla.pdf --write
```

无 `--write` 只做元数据预检查，不下载或写文件。`--revision <hash>` 可显式限制库版本；未提供时也会在下载前读取 revision，并在写入锁中再次检查。CLI 将附件 ID 写入同一个主库快照，因此备份/恢复知道哪些原文属于当前版本。

网页详情的 PDF 导入调用相同解析器。浏览器刷新后读取当前已登记附件索引。原始 PDF 只允许同源本机接口读取。25 MiB、800 页、单页 200k/全文件 6M 字符上限；损坏、加密失败、无 PDF 头、非法 paper ID 或 symlink 会返回错误，不能显示假成功。CLI 下载仅允许官方 HTTPS arXiv `/pdf/` 路径，逐次检查重定向目标，拒绝任意内网 URL。

更换解析器后对同一个原始文件重新执行命令即可；原文哈希、文档 ID 和页序不变，人工笔记与证据不修改。解析文本可能变化，审核结果不应自动沿用。实际文本记录在 `.json` 中，原文在同名 `.pdf`；这两者均属于本地备份，不属于公开静态索引。

## 验证边界

`tests/integration/pdf.test.mjs` 的两页合成 PDF 检查文件页序、内容哈希、重处理、边界及 symlink；合成文档不证明学术解析质量。上表的真实文件检查才覆盖本轮的双栏/公式/表格/附录样本。`node scripts/evaluate-retrieval.mjs` 需要上表两份精确哈希原文，输出页级检索核查结果。下载后来源若更新、文件哈希不一致，脚本会停止而非沿用旧答案标注。

## 可重复建立本地研究专题示例

当前本机库已从 V1 seed 显式初始化并登记两份原文；所有论文/实体/证据/关系仍为 private，没有公开选择。`topic-vla` 包含研究问题、方法分支、比较边界、页级证据、未覆盖问题和明确标注的整理者理解。它是依据公开论文制作的示例，不代表用户本人完成的精读或研究结论。

```sh
# 完成上述 workspace init 和两份 PDF 导入后
node scripts/enrich-research-example.mjs         # 查看将修改的本地记录
node scripts/enrich-research-example.mjs --write # 备份后原子写入并登记附件
```

脚本把已有 10 个概念加上集中维护的维度/别名，另建目标设置微调、有限历史、推理量化、操作任务与 WidowX 评测实体。为 RT-2/OpenVLA/Octo 补充多维分类和字段—证据链接，新增 OpenVLA file pages 10/21、Octo file page 15 的证据，绑定 Octo 方法到 file page 4。专题不直接比较不等条件下的成功率，也不把部署参数更新的未知状态写成已确认的“是/否”。

只允许修改 manifest 哈希吻合的原始示例对应的、尚未改动的本地私有副本；当前记录必须精确等于初始副本或本脚本目标版本。任何个人编辑、公开选择、缺失记录或同 ID 不同内容都会使整批停止，不覆盖用户修改。重复执行不新增、不改 revision、不生成额外备份。执行前备份存于 `private/backups/`，且原始 `content/` seed 始终不改。

本轮实际验证：首次预检查报告 28 项本地记录变更、两份附件；写入后再次 `--write` 为 0 变更。在隔离复制库中修改 Octo 的正文再执行，脚本拒绝且主数据逐字保持原样。后续用户开始编辑后，直接用网页维护，不需要反复执行这个示例初始化脚本。

第二次来源审核修正了“相关证据”误绑到整个比较字段的问题：移除 Octo 的 limitations/evaluation 字段绑定、OpenVLA 的 evaluation 绑定与 RT-2 的 data 绑定，因为既有证据没有覆盖这些复合字段的全部内容；证据仍可在专题和原文入口查看。OpenVLA 的 data 只保留直接支持 970k 轨迹的依据。专题中的 `RT-2 → OpenVLA` 改为同类路线并列，不暗示继承。脚本只接受首版生成记录的完整精确匹配来做这一修订，不覆盖其后的用户编辑。新增 verified 标记表示本轮代理对原文的来源核对，不代表人类专家已审核或独立实验复现。
