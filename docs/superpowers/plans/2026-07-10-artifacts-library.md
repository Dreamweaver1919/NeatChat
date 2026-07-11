# Artifacts Library Implementation Plan

维护规则：本文件更新后必须保持 70 行以内，仅保留接口、状态、验证和关键风险。

**Goal:** 新增侧栏可达、本地优先的文件库；自动收集对话中已接受的真实文件，支持搜索、分类、预览、下载和删除。

**Architecture:** 元数据与原始 Blob 分别存入专用 IndexedDB store；聊天上传异步采集，`/artifacts` 使用应用壳层，`/artifacts/:id` 保持共享 HTML 预览。

## 全局约束

- 不回填历史、不收集长文本自动附件、文件库页不提供直接上传。
- 保存原始文件；单文件 25 MB，总量软上限 250 MB。
- 文件库失败不得阻塞附件展示或消息发送。
- 中英文、44 px 操作目标、键盘焦点、深浅主题和响应式布局。
- 不增加依赖，不请求真实模型，不上传网络，不部署。

## 任务状态

1. [x] Domain model：分类、指纹、筛选/排序、预览类型和容量常量。
   - 文件：`app/artifacts/library.ts`、`test/artifact-library.test.ts`
   - 提交：`6e92d386`、`220f9862`、`9d1924eb`
2. [x] IndexedDB repository：元数据/Blob 分离、懒读、去重、限额、回滚、串行变更。
   - 文件：`app/artifacts/repository.ts`、`test/artifact-repository.test.ts`
   - 提交：`38f870fd`、`d50db7b5`、`0e199161`
3. [x] Chat capture：选择/粘贴的已接受原文件异步入库，错误本地化且不阻断聊天。
   - 文件：`app/artifacts/capture.ts`、`app/utils/file.ts`、`app/components/chat.tsx`
   - 提交：`3230f193`、`acf094af`、`0a59fc6f`
4. [x] Library page：加载/空/错误状态、自适应卡片、搜索、筛选、预览、下载、删除。
   - 文件：`app/components/artifact-library.tsx`、对应 SCSS 与页面测试
5. [x] Routing/locales：侧栏入口、`/artifacts` 路由、共享路由判定和中英文文案。
   - 文件：`app/artifacts/routes.ts`、`home.tsx`、`sidebar.tsx`、locales 与路由测试
6. [x] Finalize：最终 diff 审查完成；收尾提交 `7f53c879`。

## 验收矩阵

- 自动化：模型、存储、采集、页面、路由；并发、限额、去重、回滚和焦点恢复。
- 浏览器：空库、真实粘贴 PNG、搜索、图片筛选、Blob 缩略图、移动全屏预览。
- 视口：1512x805、390x844；检查单列/自适应网格、遮挡、溢出和触控目标。
- 性能：暖态路由目标 <500 ms，搜索/筛选目标 <100 ms，列表不得同步读取 Blob。

## 当前证据

- Jest：7 suites / 33 tests passed；TypeScript、Prettier 和生产构建 passed。
- ESLint：0 errors，`chat.tsx` 4 条原有 warnings。
- 浏览器：暖态路由约 257-258 ms；搜索约 21 ms；筛选约 261 ms（含控制调用）。
- 预览关闭后焦点返回原卡片；控制台无应用错误。

## 剩余风险

- 生产构建需在允许本地 IPC 管道的环境重跑；沙箱内 `tsx` 返回 EPERM。
- 真实 PDF/代码/大量图片和发布构建下载/删除仍需持续视觉回归。
- 本地受限网络的 Google Fonts/统计请求超时不计入暖态产品基线。
