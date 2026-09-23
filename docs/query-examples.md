# 查询示例：基本检索与关系扩展

此记录来自当前 9 篇公开示例数据的本地实际执行。查询为 `OpenVLA`，没有调用模型，也不是问答质量评测。

| 项目 | 基本检索 | 开启关系扩展 |
| --- | --- | --- |
| 直接命中文献（去重） | 1 | 1 |
| 直接命中片段 | 3 | 3 |
| 新增扩展文献 | 0 | 4 |

## 直接结果

- `ev-openvla-limits`：source / verified。论文 §6：原始 OpenVLA 仅支持单图像；历史、本体感觉和多图像输入仍待扩展，推理速度与可靠性仍有限。
- `ev-openvla-pending`：model / unverified。待核验的模型建议示例：给原始 OpenVLA 接入 Voyager 风格技能库可能改善长时程任务。尚无本文实验或实现支持，不能作为论文事实。
- `ev-openvla-summary`：source / verified。摘要释义：OpenVLA 是基于 Llama 2、DINOv2 与 SigLIP 的 7B VLA，在 970k 条机器人演示上训练；研究跨机器人控制、目标设置微调、LoRA 与量化。

模型候选 `ev-openvla-pending` 以 `model / unverified` 标记保留在检索中供人工核查。它不作为已确认关系扩展，也不发送给模型问答网关。

## 扩展结果

| 新增文献 | 一条已确认连接路径 | 结果证据 |
| --- | --- | --- |
| Octo: An Open-Source Generalist Robot Policy | `openvla` → `octo` | `ev-octo-method` |
| PaLM-E: An Embodied Multimodal Language Model | `openvla` → `rt-2` → `palm-e` | `ev-palm-e-summary` |
| RT-1: Robotics Transformer for Real-World Control at Scale | `openvla` → `topic-vla` → `rt-1` | `ev-rt-1-summary` |
| RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control | `openvla` → `rt-2` | `ev-rt-2-limits` |

路径只使用 `approved` 关系及公开且 `verified` 的支撑证据，最多两跳。共享主题产生的路径仅用于导航；同属一个主题不证明方法继承或采用。新增片段也不保证直接回答原问题。

## 解释边界

- 基本结果保持不变，扩展模式只是增加可检查的图邻居。这里未测量答案正确率、相关性、召回率或用户收益，不能据此声称图增强提升质量。
- 词法检索采用标准化后的 AND token 匹配，中文支持连续子串；没有向量或语义检索。自然语言长问句可能无结果。
- 精确匹配已知 ID、简称、标题或别名的查询按完整标准化词组匹配：`RT-2` 与 `RT 2` 都查找连续的 `rt 2`，不会因为作者名包含 `rt`、别处出现 `2` 就返回结果。其他自由关键词仍按 AND 子串匹配；结果条数不能代替相关性。
- 书目信息和笔记片段命中可能没有独立 evidence ID；网关仅使用已核验公开 evidence，证据不足时返回 422。

## 重现

在项目根目录执行：

```bash
node --input-type=module <<'JS'
import {loadData,publicProjection} from './scripts/data.mjs';
import {retrieve} from './src/lib/knowledge.mjs';
const data=publicProjection(await loadData(process.cwd()));
console.log(JSON.stringify({basic:retrieve(data,'OpenVLA'),expanded:retrieve(data,'OpenVLA',{expand:true})},null,2));
JS
```

对应回归检查：`tests/integration/query-examples.test.mjs`。修改 canonical 内容后应重新核查本记录。

## 额外小样本（真实执行）

| 查询 | 直接论文 | 扩展新增论文 | 说明 |
|---|---|---|---|
| OpenVLA | openvla | octo, palm-e, rt-1, rt-2 | 扩大候选范围，不等于提升相关性 |
| 记忆 | dreamerv3, openvla, transformer-xl, voyager | octo, palm-e, rt-1, rt-2, saycan | 扩大候选范围，不等于提升相关性 |
| latent dynamics | 无 | 无 | 无证据，不生成答案 |
| nothing-matches-xyz | 无 | 无 | 无证据，不生成答案 |
