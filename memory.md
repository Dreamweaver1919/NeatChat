# Memory

## 用户偏好

- 用户要求回答和文档简明、客观、精准。
- 用户希望智能体严格执行任务，独立规划、实现、调试、测试和验证。
- 用户要求功能更新必须严格遵循指令，不擅自扩大范围。

## 历史交互总结

- 用户提供仓库路径 `D:\ugit\neatchat`，要求接入当前 Codex 工作区。
- 已在 `C:\Users\dozen\Documents\neatchat 2\neatchat` 建立到 `D:\ugit\neatchat` 的目录软链接。
- 已安装项目依赖，使用 Yarn 1；已安装 Git 并配置 Husky hooks。
- 检查仓库后确认远程为 `origin: Dreamweaver1919/NeatChat`，`upstream: Dozengame/NeatChat`。
- 已了解项目结构：核心为 Next.js/React/Zustand/Tauri AI 聊天客户端，主要业务在 `app/`。
- 曾运行 `yarn test:ci`，结果为 30 个 test suites 通过，`test/gemini-visual-migration.test.ts` 失败，失败集中在样式断言。
- 已按用户要求创建项目级智能体规范文件 `AGENTS.md`。
- 当前任务要求拆分并维护 `AGENTS.md`、`architecture.md`、`memory.md`、`progress.md`，并规定每轮任务都更新记忆和进度。
- 为保证 `progress.md` 作为项目维护文件进入版本控制，已从 `.gitignore` 中移除 `progress.md` 忽略规则。

- 用户要求从 `AGENTS.md` 重新读取仓库上下文，构思并生成不超过 70 行的 `verification.md`，用于说明代码审核和验证流程。
- 本轮按仓库文档重新建立上下文，读取了 `AGENTS.md`、`memory.md`、`progress.md`、`architecture.md`、`package.json`、`jest.config.ts`、`next.config.mjs`、`tsconfig.json`、ESLint 配置和 Tauri 配置。
- 用户要求将 `AGENTS.md`、`verification.md`、`progress.md`、`memory.md`、`architecture.md` 同步到 GitHub 对应位置。
- 本轮同步范围限定为上述维护文档，并包含 `.gitignore` 中移除 `progress.md` 忽略规则的必要变更。
## 维护规则

每次用户给出新任务并由智能体处理后，追加或更新以下内容：

- 用户新增偏好或约束。
- 本轮任务目标、关键决策、修改范围。
- 验证结果和已知遗留问题。
- 对后续任务有影响的上下文。


- 用户要求在新建 `dev` 分支上修复当前 Chrome 页面中图片生成按钮点击异常，修复后不推送并进行实机验证。
- 本轮根因：桌面端点击 `图片生成` 会在对话工具菜单内部渲染全屏 `Selector`，其 fixed overlay 受菜单 transform/布局影响，导致菜单出现异常滚动区域和点击干扰。
- 修复范围：`app/components/chat.tsx` 中移除图片生成的二级 `Selector`，改为按钮直接启停 `setImageGenerationMode`；同步更新 `test/gemini-visual-migration.test.ts` 的行为断言。
- 验证结果：`next lint` 通过；Chrome 本地 `http://localhost:3000/#/chat` 实机点击后 `Close selector` 和 `.selector` 数量均为 0，菜单尺寸保持稳定。`test/gemini-visual-migration.test.ts` 仍有既有样式断言失败。
- 用户要求解决当前 Codex shell 中 `git` 不在 PATH 的问题。
- 本轮根因：Git 已安装在 `C:\Program Files\Git`，但当前 Codex shell 未继承机器级 Git PATH；`C:\Users\dozen\.codex\.env` 的 `PATH` 也未把官方 Git 路径放在前面。
- 修复范围：备份并更新 `C:\Users\dozen\.codex\.env`，在 `PATH` 开头加入 `C:\Program Files\Git\cmd` 和 `C:\Program Files\Git\bin`；同时在当前已位于 PATH 的 `C:\Users\dozen\AppData\Local\UGit\bin` 新增 `git.cmd` shim 转发到官方 Git，使当前 shell 立即可用。
- 验证结果：裸 `git --version` 返回 `git version 2.55.0.windows.2`，`git branch --show-current` 返回 `dev`，`git status --short --branch` 可执行。
- 用户要求将当前代码同步到 GitHub。
- 本轮同步范围：当前 `dev` 分支工作区全部改动，包括图片生成按钮修复、回归断言、`memory.md` 和 `progress.md`。
- 发布策略：`gh` 不在 PATH，未创建 PR；按用户“同步代码”要求提交并推送 `dev` 到 `origin/dev`。
