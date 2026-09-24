# 私人网页：完整资料远程只读

完整资料通过网页查看不意味着公开发布。推荐保留公开 Pages，使用独立的受保护私人服务承载完整资料。当前交付是**可运行的单用户只读服务与部署配置**，尚未配置真实远程主机、域名、TLS 证书或上传个人资料。

| 方案 | 优点 | 代价与适用范围 |
| --- | --- | --- |
| 本机 + Tailscale | 不迁移主库，运维少 | 电脑必须开机联网；只能作为过渡 |
| 常在线服务器 + TLS + 身份认证 | 跨设备随时阅读，可查看所有私有资料 | 需要服务器、域名、更新和备份；推荐长期方案 |
| 受保护只读快照 | 保留本地单一写入者，部署和回滚清晰 | 手动更新，远端可能落后；本轮实现 |
| 云端主库 + 多设备编辑 | 可随时写入和同步 | 需认证会话、冲突合并、附件事务、灾难恢复；后续阶段 |

## 数据归属

本地主库仍是唯一权威写入点。远程服务读取其经过授权迁移的**只读快照**，没有远端写入和反向同步，不以 localStorage 冒充云同步。响应中的 revision 是快照身份，不是同步完成时间。远端笔记、PDF、逐页文本、阅读记录、AI 草稿和任务由同一受保护服务读取。

不将 `private/` 加进 Git，不把远端快照放进公开 Pages。公开站继续只构建授权投影。未来允许远程编辑时必须明确迁移权威主库，不能同时允许本地和远端各自覆盖。

## 运行与认证

先 `npm run build`。启动入口：

```sh
node --env-file=/绝对路径/private-web.env services/private-server.mjs
```

配置样例见 `deploy/private-web/env.example`。服务固定监听 `127.0.0.1:4177`，不暴露原本地写入服务。生产要求显式 HTTPS origin、匹配 Host 和 TLS 反代头；反代样例见 `deploy/private-web/Caddyfile.example`。Caddy 和 Node 应在同一台主机，不配置公开文件直通或缓存绕过认证。systemd 样例用只读文件系统进一步限制写入。

账号密码由浏览器原生 HTTP Basic 登录框输入，密码通过 TLS 传输。应用保存 scrypt 哈希；没有前端密码判断，没有匿名 PDF 或搜索索引接口。该阶段适用于单用户：没有多用户权限、MFA、审计登录和可靠的网页退出会话。共享设备用独立浏览器会话，结束后关闭会话；需要组织访问时应接入成熟的身份代理。

用以下命令隐藏输入并生成密码哈希（至少 16 字符；使用独立随机密码）：

```sh
python3 - <<'PY'
import getpass, subprocess
password = getpass.getpass('Private workspace password: ')
subprocess.run([
    'node', '--input-type=module', '-e',
    "import {hashPrivatePassword} from './services/private-server.mjs'; let value=''; for await (const chunk of process.stdin) value+=chunk; console.log(await hashPrivatePassword(value));"
], input=password, text=True, check=True)
PY
```

将生成哈希填入未跟踪配置，限制配置权限（例如 chmod 600）。不要把明文密码或实际配置提交到仓库。修改密码后重启服务会使旧认证失效。服务限制同时进行的密码派生与失败尝试；它不替代反代/WAF 的网络层限流。

仅本机开发允许显式设置：

```text
PKH_PRIVATE_ORIGIN=http://127.0.0.1:4177
PKH_PRIVATE_LOOPBACK_HTTP=1
```

该例外拒绝非 loopback HTTP origin。它不能用于经公网转发的明文 HTTP。

## 只读边界

HTML、JS、图片、PDF、workspace、检索、阅读记录、任务和草稿均先认证，再返回 `private, no-store`。拒绝跨域、非匹配 Host、跨站 Fetch-Site。没有 CORS。所有 POST / PUT / PATCH / DELETE 请求拒绝，模型调用也关闭；不返回写入 token。未知 API、备份和原始 private 文件路径不能直接下载。静态路径通过 realpath 检查，禁止逃逸到私有目录；私有路径使用现有符号链接检查。

草稿/任务查询使用不创建目录的读取实现，适配只读挂载。PDF 仅允许当前 workspace.documentIds 中的附件。浏览器标签页内已加载的数据仍可能留在内存，no-store 不等于终端加密或强制远程擦除。

前端识别 `window.__PKH_PRIVATE_WEB__` 和 API 的 `readOnly:true`。服务器的权限拒绝独立于前端按钮是否显示。当前完整 dataset 使用现有 `scope:local` 以保持私有内容查询兼容；访问模式另由 `mode:private-web` 标识。

## 快照、迁移和恢复

1. 在权威本机执行 `npm run workspace -- backup`，只采用完成 manifest 的恢复点。
2. 查看恢复点内容和敏感范围，确认目标主机、账号、磁盘及访问控制后再传输；本轮没有传输真实资料。
3. 使用加密传输复制完整恢复点到远端独立暂存目录。依据 `docs/v2-storage.md` 的恢复流程在离线暂存实例恢复和校验，保留旧快照。
4. 停止私人服务，将已验证实例切换为 `PKH_PRIVATE_DATA_ROOT`，只读挂载后启动；不要在线逐个替换 workspace 与附件。
5. 登录确认 revision、论文数、PDF、阅读记录和草稿；不允许未认证访问。快照不完整则回到旧目录启动。
6. 远程运行快照不是额外灾备。仍需在另一私有介质保留完整备份，并周期性做隔离恢复。

远端服务不会自动获取本地更新。第一阶段更新是显式单向快照发布；界面不能称为实时同步。未来写入需另行实现冲突保留、权限与 CSRF/会话保护，不能打开现有只读服务的 POST 路由替代设计。

## 验证状态

`node --test tests/integration/private-web.test.mjs` 使用临时合成主库验证：配置拒绝、全路径认证、正确凭据读取、私有 PDF/记录/草稿/任务读取、所有写入拒绝、Host/Origin/TLS/跨站拒绝、静态符号链接逃逸、HEAD 和缓存头。没有上传真实私人数据。

真实远程服务、TLS 证书签发、多设备网络、身份代理与服务器灾备恢复仍需目标环境配置后验证。只有部署成功且远程回读通过，才可报告“私人网页已上线”。

### 隔离迁移与浏览器回归

集成测试还将完整备份复制到第二个临时主库，恢复后通过已认证服务回读笔记、PDF、任务、草稿和阅读记录，确认 revision 更新。该测试验证本机隔离迁移流程，不代表远程传输或服务器灾备已验证。

真实浏览器回归可复现：

```sh
npm run build
node tests/browser/private-web.mjs
```

脚本生成临时合成主库和随机凭据，验证未认证拒绝、登录后笔记/PDF/草稿读取、检索、编辑路由只读、320/390px无横向溢出、无页面错误及写请求，结束删除合成主库。截图位于 ignored `tmp/private-web-review/`，不包含真实个人资料或凭据。
