# 运行与 GitHub Pages

## 本地

Node 22.13+，npm；本地持久工作台按 [README](../README.md) 初始化后运行 `npm run local`（4176）。`npm run dev` 仅用于前端开发。静态预览 `npm run build && npm run preview`。Vite base 是 `./`，生成相对资源路径。内部使用 hash，项目 Pages 正确 URL 为 `https://<owner>.github.io/<repo>/#/paper/openvla`，而不是 `/paper/openvla`。刷新 hash 深链接只请求仓库根 index.html。

## GitHub 仓库与模板

仓库目标为 `ziyang-c23/paper-knowledge-hub`，用于公开模板、应用源码和明确允许公开的 Octo 示例。完整 PDF、个人分析、私有笔记和本地工作区不会进入 Git；它们由 `.gitignore` 中的 `private/` 边界保护。

仓库创建后可在 GitHub Settings → General 勾选 **Template repository**，其他人即可通过 **Use this template** 复制应用和示例。Pages 站点公开可访问，因此发布前必须确认 `content/` 与生成的 `dist/` 只包含公开投影。模板仓库与 Pages 访问策略是两个设置，分别检查。

## Pages workflow

1. GitHub Settings → Pages → Build and deployment 选择 GitHub Actions。
2. 默认分支为 main；本项目 `.github/workflows/ci.yml` 在 push / PR 做安装、校验、单元与集成测试、构建、浏览器验收。
3. `.github/workflows/deploy.yml` 在 main 的 push 或手动 `workflow_dispatch` 时运行。部署流程先 validate、test、build、e2e，再 upload-pages-artifact，只上传 dist/；因此每次合入 main 都会更新公开示例，其他分支不会直接发布。
4. 等待 deploy-pages 成功，使用真实步骤返回的 URL；实际打开首页、详情 hash、刷新、搜索。失败时先查 Pages 配置/权限/资源 404，不宣称部署成功。

模板已在本机用严格静态服务器挂载 `/paper-knowledge-hub/` 验证资源和深链接，不依赖 catch-all rewrite 或 GitHub 404 fallback。已确认的公开站点为 [ziyang-c23.github.io/paper-knowledge-hub](https://ziyang-c23.github.io/paper-knowledge-hub/)。本轮最后一次校验与 Pages 部署均已成功，对应提交 `283a682`；线上读回已确认论文方法图、笔记正文、实验筛选正常，公开页面没有编辑入口、本地 API 或私有 PDF 链接。

## 可选网关

`npm run serve:ai` 的 Node 服务使用同一 publicProjection、同源 API 并服务 dist/，仅在 `127.0.0.1:4174`。配置 .env，重建再启动。网关加载内容后需要重启才能读到新主数据。它不在 Pages 中运行；静态站点配置状态显示未配置为正常行为。不要将 API Key 添加到 Actions 的前端 build env 或公开仓库。

## 源码包

`npm run package` 校验并打包允许的源码、文档、测试和 schema；content 按当前权威库的公开投影重建。本地模式不打包截图、PDF 或私有主库。公开源码包只包含当前公开投影（当前示例包含 Octo 及其允许公开的专题、实体、证据和关系）；完整 PDF、个人分析、私有笔记和本地主库仍被 `private/` 边界排除。生成 `artifacts/paper-knowledge-hub-source.zip`，不包括已安装依赖、dist、.git、私有文件或 .env。解压后进入 paper-knowledge-hub/，`npm ci` 重建。首次 npm ci 与测试浏览器安装需要网络；之后基础站点不需要外部服务。
