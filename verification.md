# Verification

## 目标

本文件定义 NeatChat 的代码审核和验证工作流。验证应匹配用户指令、改动风险和项目架构，不用无关检查替代关键检查。

## 审核顺序

1. 明确边界：确认用户要求、禁止改动项、影响模块。
2. 查看变更：运行 `git status --short --branch` 和 `git diff`。
3. 映射影响面：对照 `architecture.md` 判断是否涉及 UI、store、API、MCP、配置、Tauri、测试或构建。
4. 审核代码：优先找行为回归、数据丢失、访问控制绕过、异步竞态、错误处理缺失和测试缺口。
5. 执行验证：按风险选择最小充分命令。
6. 记录结果：在 `progress.md` 写明命令、结果、失败原因或未运行理由。

## 基础命令

非纯文档改动至少执行：

```bash
git status --short --branch
git diff
yarn lint
```

依赖变化执行：`yarn install --frozen-lockfile`。不要用 `yarn test` 做交接检查；它是 watch 模式。

## 测试选择

通用回归：`yarn test:ci`。

按影响面优先跑相关测试，再决定是否全量：

- 访问控制：`test/access-control.test.ts`、`test/access-code-validation.test.ts`
- 配置：`test/config-merge.test.ts`、`test/server-config.test.ts`
- 模型请求：`test/model-provider.test.ts`、`test/chat-stream-payload.test.ts`
- OpenAI：`test/openai-responses-builder.test.ts`、`test/openai-image.test.ts`
- MCP：`test/mcp-*.test.ts`、`test/mcp-market-tools-list.test.tsx`
- Markdown/附件：`test/markdown-*.test.tsx`、`test/attachment-file-types.test.ts`
- UI 样式迁移：`test/gemini-visual-migration.test.ts`

## 构建验证

- Next.js 路由、API、SSR、配置或资源加载：`yarn build`
- export/PWA/静态资源：`yarn export`
- `src-tauri/`、桌面流式请求、窗口能力或 Tauri 配置：`yarn app:build`

## 人工审核重点

- `app/store/chat.ts`：消息顺序、streaming、停止/重试、记忆压缩、MCP 回填。
- `app/client/platforms/*`、`app/api/*`：鉴权头、base URL、payload、错误格式、超时、流解析。
- `app/store/config.ts`、`app/config/server.ts`：默认值、环境变量、锁定字段、公开配置泄漏。
- `app/mcp/*`：授权检查、工具列表、执行结果格式、失败隔离。
- `app/components/*` 和样式：可访问性、响应式布局、文本溢出、主题变量。

## 通过标准

相关命令 exit code 为 0；失败项已解释且与本次改动无关，或修复后已重跑；`memory.md`、`progress.md`、必要时 `architecture.md` 已更新。