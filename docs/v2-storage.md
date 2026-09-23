# V2 本地存储与恢复手册

## 两种运行模式

公开模式读取生成的 `src/generated/public.json`，仅展示审查后允许公开的内容。本地模式由 `npm run local` 启动，默认地址 `http://127.0.0.1:4176/`，读取完整私有主库；保存直接写盘，刷新或服务重启后保留。浏览器存储不再承担论文主数据持久化。

首次使用：

```sh
npm ci
npm run workspace -- init             # 预览，不创建主库
npm run workspace -- init --write     # 仅首次复制模板；所有对象默认 private
npm run build
npm run local
```

初始化重复运行不会覆盖已存在主库。初始化后公开构建可能为空，这是默认私有的预期结果；本地页面仍能看到完整库。主库读取失败不会退回示例。不要删除 `private/workspace.json` 来“修复”空站点，否则将丢失权威入口并重新启用模板来源。

## 文件归属

| 文件 | 作用 | 公开包 |
|---|---|---|
| `private/workspace.json` | 权威主库：dataset、revision、documentIds | 排除 |
| `private/documents/<id>.pdf` | 不变的 PDF 原件 | 排除 |
| `private/documents/<id>.json` | 逐页提取文本及解析质量记录 | 排除 |
| `private/backups/<backupId>/` | 完整恢复点和完成清单 | 排除 |
| `content/` | 未初始化时的公开模板来源 | 本地初始化后，以当前公开投影重新生成包中内容 |
| `src/generated/public.json`、`dist/` | 可重建的公开派生物 | 仅审查后的公开字段 |
| `site.config.json` | 界面配置；备份和恢复时一并处理 | 包含；勿写敏感事实 |

`private/` 被 Git 忽略，但不是加密保险箱；应依赖系统账号、磁盘加密和自己的离线备份。主库与 PDF 路径拒绝符号链接，避免读写落到其他位置。不要把私有主库放进公开仓库或源码 ZIP。

## 保存、冲突与稳定 ID

每次保存提交完整记录和 `expectedRevision`。服务端在独占锁内读取最新版本；不一致返回 409，不覆盖当前文件。修改同 ID 的记录是更新；相同规范化 DOI、arXiv 或题名的不同 ID 会报告已有 ID。删除旧 ID 再创建新 ID不是日常更新方式。

写入采用同目录临时文件、文件同步和原子替换。恢复产生新 revision，即使恢复的数据与旧版本完全相同，也不会让旧编辑器误以为自己仍持有最新版本。独占锁覆盖保存、PDF 导入、备份和恢复；它是本机单库并发保护，不是多人远程数据库。

遇到冲突：先从编辑器导出尚未保存的修改，重新读取主库，再合并有意保留的内容。不要把旧 revision 替换成新 revision 后直接重放旧整条记录，这会抹掉别人的字段修改。

## CLI / Agent 修改示例

先从当前主库抽取一份完整记录，在 ignored private 目录编辑，保留已有字段和稳定 ID：

```sh
npm run workspace -- status
node --input-type=module -e "import fs from 'node:fs'; const s=JSON.parse(fs.readFileSync('private/workspace.json')); const p=s.dataset.papers.find(p=>p.id==='openvla'); if(!p) throw Error('Record not found'); fs.writeFileSync('private/openvla-edit.json',JSON.stringify({...p,visibility:'private'},null,2));"
```

编辑 `private/openvla-edit.json` 后，使用 status 返回的 revision（将下方占位符替换为真实值）：

```sh
npm run workspace -- put private/openvla-edit.json --revision REVISION
npm run workspace -- put private/openvla-edit.json --revision REVISION --write
npm run validate
npm run workspace -- status
```

第一条只验证；第二条才保存。第一次实际保存会改变 revision，不能继续用旧值写第二条记录。`put` 默认 collection 为 `papers`；其他对象显式加 `--collection topics`、`concepts`、`evidence` 或 `relations`。每条都走完整 schema、引用及身份校验；作者暂未知可使用空数组 `authors: []`，其他最小书目字段仍须满足 schema。

新建时使用新的稳定 ID、`visibility: "private"` 和 `lifecycle: "draft"`。常规入库将 lifecycle 改为 `active`；归档改为 `archived`。归档保留内容及附件，从默认列表、统计、检索、图谱和公开构建排除；恢复为 active 后再次进入这些本地视图。

V1 `npm run import` 只面向尚未初始化的公开模板；初始化后明确拒绝执行，防止写入不再被读取的 `content/`。网页 JSON/Markdown 导入先填入编辑器，由你核对后保存。

## 发布候选与依赖

`visibility: "public"` 只表示允许进入下一次公开构建；不等于已经部署。CLI 发布或修改公开记录时需同时传 `--publish-consent`，网页需要重新勾选审查。通常先把修改保存为 private，再完成审查。

```sh
npm run workspace -- put private/reviewed-paper.json --revision REVISION --publish-consent
npm run workspace -- put private/reviewed-paper.json --revision REVISION --publish-consent --write
npm run build
npm run export -- --format json
npm run package
```

只公开 `active` 论文。`personalAnalysis`、`privateNotes`、PDF、全文索引、文档定位字段和 quote 均不进入公开投影。Paper 的已审查 note、结构化字段、摘要与书目信息会公开，不能把私密想法放在这些字段并依赖界面隐藏。

依赖不会自动变成公开：私有 topic/facet 引用被移除；证据必须自身公开且对应论文公开；关系还要求两端实体和所有证据都公开。`claimEvidence`、topic.evidenceIds/compareIds 同样只保留可公开的引用。关系可表达 `cites`（仅引用），不代表采用或扩展；pending/rejected 关系不参与审核关系扩展。

源码 ZIP 从同一公开投影重建 `content/`，不会把被你改为 private 或 archived 的旧模板记录重新装入包。它不包含完整本地库、PDF、备份、环境密钥和本地截图。公开包重新初始化得到的是该包的公开内容副本，无法恢复未发布资料；完整恢复必须使用私有备份。

## 备份与恢复

```sh
npm run workspace -- backup
npm run workspace -- backups
npm run workspace -- restore BACKUP_ID           # 验证恢复点，不更改主库
npm run workspace -- restore BACKUP_ID --revision REVISION --write
```

恢复会先备份当前版本，再复制被恢复的原件和逐页记录、恢复配置，并用新 revision 替换主库。当前主库的 documentIds 决定哪些附件属于这一恢复点；较新的不可变 PDF blob 可留在本地以便回查，但不会被恢复后的检索/API自动暴露。备份列表只展示有完成清单的恢复点，失败的半成品目录不能视为成功备份。

备份内有 `workspace.json`、`documents/`、`site.config.json`（若存在）和 `manifest.json`。不备份 `.env` 密钥、node_modules、构建结果或过去所有备份。将选定恢复点另存到由你控制的私有介质，才能抵御整盘丢失；不要用 GitHub 源码包替代私有备份。

## 故障恢复与限制

- 版本冲突：导出未保存修改、重新读取、合并后再保存。
- 服务突然终止并持续报告 busy：先停止本项目的本地服务、PDF CLI 和其他写入者，检查进程确认没有活跃操作；确认后仅删除空目录 `private/.workspace-lock`，例如 `rmdir private/.workspace-lock`。不要批量删除 private。锁不自动过期，避免把长时间 PDF 解析误判为失联。
- 主库损坏到无法解析：先停服务，将整个 private 目录另存到私有恢复位置；选一个具有完整 manifest、workspace 和所有附件的备份，人工恢复其 workspace.json、documents 和配置后运行 validate。正常恢复 API 要求当前主库可读，不能绕过损坏状态的校验。
- 磁盘写入失败：保留当前文件和完整备份。原子替换保护单个主库文件，但配置和附件并非跨文件数据库事务；断电后的恢复要以完成备份清单及附件实际存在为准。
- PDF 无可提取文字：解析器没有 OCR；表格、公式、图片和双栏阅读顺序均需核验。自动文本不自动生成 verified evidence。

本地服务只监听 loopback，校验 Host、Origin、Fetch-Site 和写入 token，不启用跨域访问。可选模型调用在服务端重新检索公开投影，只发送已核验公开证据及用户明确同意发送的查询；模型未配置、证据不足、超时或引用非法都会保留明确失败状态，不回退为伪造答案。

## 校验边界

`npm test` 使用隔离临时主库验证持久保存、身份冲突、公开投影、归档、完整恢复、重启和请求边界。历史 OpenVLA 示例测试在包中未包含该公开模板时会明确 skip，通用合成检索测试仍执行。V1 固定示例浏览器场景依赖原始公开模板；它与日常用户数据的规模无关，不能要求清空或重新公开个人库来满足测试。
