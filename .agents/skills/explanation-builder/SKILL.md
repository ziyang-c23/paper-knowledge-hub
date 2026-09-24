---
name: explanation-builder
description: 从已读取的分层来源生成可回查的快速导读、方法解释、实验解释和阅读路径。
---

共享入口与契约：[paper-knowledge-hub](../paper-knowledge-hub/SKILL.md)。本技能保留为定向兼容入口；数据字段、revision、隐私和网页审阅均沿共享契约，不要求执行其余所有技能。


# 研究解释层

输入 `source-reader` 输出或 `ai:prepare` 上下文，生成：30 秒导读、3 分钟方法信息流、5 分钟实验条件与结果边界、失败/局限和下一步阅读。解释层不能复制整篇原文；每个模块引用来源 ID，并标注 `paper-claim`、`official-project-claim`、`code-observation`、`runtime-result`、`curator-synthesis` 或 `unverified-hypothesis`。

方法流程至少说明输入、表示、核心计算、输出、训练和推理；动画数据只表达已知步骤。实验图必须同时显示任务、数据、适配、指标、单位、次数和不能外推的条件。未知值用 `null`，不绘制成零。

结构化结果进入 `visuals` 或草稿记录，沿现有 `ai-task` 的 section/experiments/compare 任务审阅，不另建第二份正文。首屏应能独立读懂，交互仅加深理解；支持暂停、逐步、来源定位和 reduced-motion 静态替代。

## 可执行输出

先检查 `schemas/dataset.schema.json`、当前论文 `visuals` 和 `services/ai-tasks.mjs` 的任务输出契约。复用 `visuals.method.steps/modes/timeline` 和 `visuals.experiments`，不要为同一机制再建一份不被渲染器读取的动画数据。节点说明解释“为什么有这一步、输入如何改变、输出供谁使用”；`section` 必须匹配实际笔记标题，`source` 必须指向实际读取的位置。动画的时间是讲解节奏，不是模型延迟。没有数值依据时使用标为示意的状态变化，不模拟性能。

先提出一条具体理解问题（如“预测整个动作块为什么只执行一部分”），选择步骤图、窗口时间轴、代码定位或视频片段中最直接的一种。不要默认每篇都需要所有模块。默认静止，手动步进可独立完成讲解；播放结束停止，减少动效后停止正在播放的动画。官方演示只描述确实观察到的行为；未观看的视频保留为待看来源。

输出前沿用户路径核验：首屏理解问题 → 一次操作看机制变化 → 对应笔记/来源 → 返回原处。导读复用现有 problem/method/conclusions/limitations，不复制整篇 note。使用已有草稿接口提交；不因产物通过 schema 就宣称解释准确或实测复现。
