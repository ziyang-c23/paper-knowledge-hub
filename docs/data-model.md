# 当前数据模型

执行定义为 [dataset.schema.json](../schemas/dataset.schema.json) 和 [data.mjs](../scripts/data.mjs)。V2 保留兼容的 `dataset.schemaVersion: 1`，新增字段均为可选；外层本地存储包装使用 `storeVersion: 2`，不是两套论文正文。

```text
private/workspace.json
  storeVersion: 2
  revision: SHA-256-shaped fresh revision token
  createdAt / updatedAt
  documentIds: attached local document IDs
  database: { version: 1, properties, views }
  dataset: { schemaVersion: 1, papers, topics, concepts, evidence, relations }
```

普通写入前的旧 envelope 会以 `<revision>.json` 快照保存在 ignored `private/history/`，最多保留 100 个；快照只用于回查/下载，不包含独立 PDF 原件。完整备份仍保存可恢复的主库、附件和站点配置。

API 返回的 dataset.scope='local' 只是运行时视图标记，不写入 schema 数据。每次修改完整 dataset 校验后原子替换，revision 冲突返回 409。字段定义与枚举以 schema 为准。

| 对象 | 必需字段 | 主要可选字段 |
|---|---|---|
| Paper | schemaVersion,id,title,year,authors,url,visibility | note、abstract、阅读状态、topics/tags/aliases、书目标识、比较字段；lifecycle、personalAnalysis、facets、claimEvidence |
| Topic | schemaVersion,id,title,visibility | 范围、维度、问题、边界；analysis、gaps、evidenceIds、compareIds |
| Concept / research entity | schemaVersion,id,title,kind,visibility | description、aliases、dimension、lifecycle、note、relatedIds、sources |
| Evidence | schemaVersion,id,paperId,kind,text,status,visibility | url、locator；本地 documentId、pageIndex、pageLabel、quote |
| Relation | schemaVersion,id,source,target,type,evidenceIds,origin,status,visibility | demo 仅作原模板标识 |

ID 为最长 120 的 `[a-z0-9]+(?:-[a-z0-9]+)*`，跨对象全局唯一。旧 content 的文件名必须等于 ID；本地主库中以记录 ID 引用。论文 DOI 去 URL 前缀并小写，arXiv 去版本做身份去重；版本信息另存。同规范化题名的新 ID 也被本地写入层拒绝。author 数组可以暂空，缺失可选字段表示未知，不推断为 false。

## 状态与归属

- visibility：private/public，所有初始化对象默认 private。公开是逐对象审查后的候选属性。
- lifecycle：draft/active/archived，未设置的旧论文兼容为 active。本地默认展示 draft+active；公开只包括 active。
- status：unread/reading/reviewed，只表示阅读整理状态。
- personalAnalysis：私有研究判断，始终从公开投影排除；privateNotes 是历史兼容字段，同样排除，建议新内容使用 personalAnalysis。
- facets：problem、architecture、learning、memory、deployment、task、dataset、environment 八个维度，值为 concept ID 数组；若概念指定 dimension，引用必须匹配。
- claimEvidence：比较字段名到 evidence ID 数组；证据必须属于该论文。

paper.topics 是主题归属唯一来源。专题、图谱和统计从现有主库派生，不维护第二份节点或计数。正文只存在于 paper.note；外部 Markdown 可以是输入材料，完成导入后不在两处手动维护。

`concepts` 也承载研究实体档案。旧 `concept/method/dataset` 类型保持兼容，新增 `person/institution/project/problem/model/environment/benchmark`。`relatedIds` 是人工资料组织关系，不自动推出任职、采用或继承；`sources` 保存带标题、URL 和支持范围的回查材料。`database` 是可选的本地视图与类型化个人属性配置，不改变论文正文和证据模型。属性类型还包括只读 `formula` 与 `rollup`；它们只保存表达式或汇总配置，派生值在查询、排序、筛选、分组和导出时计算，不写入 `paper.customProperties`。

## 证据与关系

Evidence.kind：source 原文/释义，note 整理者归纳，model 模型候选，unverified 待核验。status 为 verified/unverified，model/unverified 类型不能直接标 verified。verified 表示人工核验出处与支持范围，不等于实验复现。

Relation.type：studies 研究、uses 采用、extends 扩展、related 相关、cites 仅引用；origin 为 source/curator/model/similarity；status 为 approved/pending/rejected。approved 必须引用至少一条 verified evidence，且 origin 不为 model/similarity。引用与相似度不自动推出采用或扩展。

本地 PDF 是独立原件和解析记录，不把全文塞进 paper.note。documentId 对应哈希派生文件身份，pageIndex 是从 1 开始的文件页序；pageLabel 明示文件页标签，不猜测印刷页码。自动文本、表格与公式质量信息保留在解析记录中。通过本地记录 API/CLI 保存证据时，pageIndex 必须绑定当前已附加的 documentId，文档必须属于同一论文，且该文件页实际存在；这只验证链接与页序，不证明文字支持该主张。

## 公开投影

公开构建显式允许字段，始终去掉 personalAnalysis、privateNotes、lifecycle、PDF 定位字段和 quote。只保留公开且 active 的论文；私有 topic/facet 引用被移除；证据必须自身公开且所属论文公开；关系需两端实体和全部证据可公开。claimEvidence、topic.evidenceIds/compareIds 同样过滤依赖。

content 是尚未初始化时的公开来源。存在本地权威库后，build、export、validate、package 和网关使用当前库；源码包以其公开投影重建 content，避免旧模板重新进入公开包。未知字段、无效枚举、重复身份和悬空引用均不通过保存校验。以后做不兼容变更必须设计显式迁移。
