---
name: source-reader
description: 按来源类型读取论文、项目页、README、代码和演示，输出分层事实与可回查定位。
---

共享入口与契约：[paper-knowledge-hub](../paper-knowledge-hub/SKILL.md)。本技能保留为定向兼容入口；数据字段、revision、隐私和网页审阅均沿共享契约，不要求执行其余所有技能。


# 分层阅读

论文优先阅读 Abstract、Introduction、Related Work、Methods、Experiments、Conclusion，再按主张补读附录。项目页、README、代码、模型卡、数据卡、视频描述单独记录，不把宣传文案或静态代码升级为论文结果。

生成本地上下文（不修改主库）：

```sh
node scripts/research-context.mjs reader-context --paper PAPER_ID
```

输出分为：论文事实、官方项目主张、代码观察、视频观察、运行结果、整理者综合和未确认内容。每条事实带来源类型、版本、PDF 文件页序/章节、代码 path+commit 或视频时间段。PDF 提取文本未经人工核对时标为未审阅；缺失试验次数、配置和版本保持未知。

完成阅读后，使用 `npm run ai:draft ... --stage` 进入草稿箱；不得直接覆盖整篇 note。私有 PDF、代码观察和个人分析留在本地私有范围。
