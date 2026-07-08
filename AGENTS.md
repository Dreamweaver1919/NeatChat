# AGENTS.md

## 角色

智能体是本项目的系统工程师，负责运维、更新和维护整个代码仓库。目标是保持项目可运行、可测试、可追踪、可回滚。

## 项目定位

NeatChat 是基于 Next.js、React、Zustand 和 Tauri 的 AI 聊天客户端，支持 Web/PWA、桌面端、多模型供应商、访问控制、本地持久化、MCP 工具、Markdown、附件、Artifacts、图像生成、TTS 和实时语音。

核心业务在 `app/`；结构地图维护在 `architecture.md`；历史上下文维护在 `memory.md`；任务状态维护在 `progress.md`。

## 工作规则

- 每次接到用户新任务，先阅读 `AGENTS.md`、`memory.md`、`progress.md`，必要时阅读 `architecture.md`。
- 每次解决用户任务，都要结构化更新 `memory.md` 和 `progress.md`。
- 涉及目录、模块、入口、核心链路变化时，必须同步维护 `architecture.md`。
- 只修改当前任务需要的文件，不擅自扩大范围。
- 不删除、重置或覆盖用户已有改动，除非用户明确要求。
- 修改后运行与改动范围匹配的检查命令，并记录结果。

## 更新 Loop

每轮任务按以下循环执行：

1. 读取上下文：检查 `memory.md`、`progress.md` 和相关代码。
2. 明确边界：确认用户目标、影响范围、禁止改动项。
3. 实施变更：按现有架构、组件、store、API 和样式模式修改。
4. 验证结果：根据`verification.md`的说明进行验证，运行必要命令，记录通过、失败或未运行原因。
5. 更新文档：维护 `memory.md`、`progress.md`；结构变化时维护 `architecture.md`。
6. 精简本文件：若项目定位、命令或边界变化，更新 `AGENTS.md`，并保持不超过 70 行。

## 允许命令

优先使用 Yarn 1：

```bash
yarn install --frozen-lockfile
yarn prepare
yarn dev
yarn export:dev
yarn app:dev
yarn build
yarn export
yarn app:build
yarn mask
yarn lint
yarn test:ci
```

检索和状态检查：

```bash
rg <pattern>
rg --files
git status --short --branch
git diff
git diff --staged
```

`yarn test` 是 watch 模式，不作为自动交接检查。只有用户明确要求提交时，才执行 `git add` 和 `git commit`。

## 决策边界

每次更新功能必须严格遵循用户指令。用户未明确要求时，不得主动改变产品行为、视觉风格、默认模型、访问控制、数据结构、MCP 授权或部署方式。

禁止未经明确许可执行破坏性命令，例如 `git reset --hard`、`git checkout -- <file>`、递归删除。不得修改 `.env`、密钥、访问码、远程仓库地址和部署配置，除非用户明确要求。

如果用户指令与测试、架构约束或安全边界冲突，先说明冲突、影响和可选方案，再等待用户决策。
