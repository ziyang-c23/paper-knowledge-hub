---
name: hub-entities
description: 在 Paper Knowledge Hub 中整理学者、机构、方法、模型、数据集与研究关系，消歧后生成实体或关系草稿。
---

# 研究实体与关系

输入实体名称、已有 ID、相关论文或明确的资料来源；输出 `concepts` 或 `relations` 草稿及其网页入口。先读 [接口与约束](../../../docs/ai-workflows.md)。

读取当前实体、别名、论文和关系，按身份匹配已有 ID。论文、同名模型、方法与项目保持独立；姓名相同不自动归并。学者区分论文发表时机构与当前任职；事实来源注明支持范围。方法解释机制与适用问题，数据集/环境记录任务与评估范围；未核实信息保持未知。

实体字段为 schemaVersion,id,title,kind,visibility，加 description,note,aliases,sources,relatedIds。类型使用 `src/lib/entities.mjs`；来源格式见 `schemas/dataset.schema.json`。手工 relatedIds 只表达资料组织，不宣称任职、采用或继承。

关系使用独立记录：source,target,type,evidenceIds,origin,status。type 为 studies/uses/extends/related/cites；引用不是采用。没有已核验依据的模型建议必须保持 pending，不能自动 approved。

```sh
npm run ai:draft -- private/ai-drafts/entity.json --collection concepts --create-only --stage
npm run ai:draft -- private/ai-drafts/relation.json --collection relations --create-only --stage
```

更新已有实体不加 create-only，先读完整记录合并字段；每次应用使用 fresh revision。网页草稿箱确认后写入，或在用户已有明确入库授权时使用文档中的 CLI。依次保存依赖对象后再创建关系，不能伪造占位证据来通过校验。回读实体详情、关联论文和证据入口。身份不明或版本冲突时保留草稿并报告具体缺项。
