# Progress

## 当前任务

- [x] 确认当前分支、远端和待同步 diff。
- [x] 确认 `gh` 不在 PATH，本次只提交并推送分支，不创建 PR。
- [x] 重新运行发布前验证。
- [ ] 提交当前工作区改动。
- [ ] 推送 `dev` 到 GitHub `origin/dev`。

## 历史任务

- [x] 在 `AGENTS.md` 增加更新 loop，说明如何维护自身、项目定位和文档。
- [x] 新增 `memory.md`，记录用户和智能体历史交互总结。
- [x] 新增 `progress.md`，记录当前任务清单和完成状态。
- [x] 新增 `architecture.md`，把项目结构从 `AGENTS.md` 中拆出。
- [x] 精简 `AGENTS.md`，目标是不超过 70 行。
- [x] 验证 `AGENTS.md` 行数和文件存在性。
- [x] 从 `.gitignore` 移除 `progress.md` 忽略规则，使维护文件可被版本控制。
- [x] 因根目录维护文件变化，更新 `architecture.md`。
- [x] 新增 `verification.md`，总结代码审核和验证工作流。

## 验证记录

- GitHub 同步范围：`AGENTS.md`、`verification.md`、`progress.md`、`memory.md`、`architecture.md`，并包含 `.gitignore` 的 `progress.md` 追踪规则调整。
- `verification.md` 行数：58 行，符合不超过 70 行要求。
- `AGENTS.md` 行数：69 行，符合不超过 70 行要求。
- Git 可见性：`progress.md` 已不再被 `.gitignore` 忽略。
- 未运行 `yarn test:ci`：本次只同步维护文档和 `.gitignore`，未修改运行时代码。


- 图片生成按钮修复验证：
  - `yarn.cmd jest test/gemini-visual-migration.test.ts --runInBand -t "keeps the Gemini-style empty state hooks"`：失败停在既有 `sendButtonDisabledBlock` 样式断言；本轮新增的图片生成断言已通过。
  - `yarn.cmd jest test/gemini-visual-migration.test.ts --runInBand -t "keeps the Gemini-style empty state hooks|keeps composer multimodal menu states"`：失败包含既有样式解析断言。
  - `yarn.cmd lint`：PowerShell/Yarn 环境未解析 `next`。
  - `.\node_modules\.bin\next.cmd lint`：首次因沙箱阻止写 `D:\ugit\neatchat\next-env.d.ts` 失败；提升权限重跑通过，无 ESLint warnings/errors。
  - Chrome 实机：本地 `http://localhost:3000/#/chat` 打开工具菜单后点击 `图片生成`，`Close selector` 数量 0、`.selector` 数量 0，菜单 `320x156` 且 scroll/client 尺寸一致；本地 MCP 未启用时显示“图片生成未启用”为预期业务保护。


- GitHub 同步验证：
  - `git diff --check`：通过；仅提示 Git 将 LF 转 CRLF。
  - `.\node_modules\.bin\next.cmd lint`：首次因沙箱阻止写 `.next/cache/eslint` 失败；提升权限重跑通过，无 ESLint warnings/errors。## 已知状态

- 项目依赖已安装。
- Git 和 Husky hooks 已可用。
- 当前已知测试问题：`test/gemini-visual-migration.test.ts` 存在样式断言失败。

## 维护规则

每次用户提供新任务时，智能体必须：

1. 新增或更新任务条目。
2. 使用 `[ ]` 标记未完成项，使用 `[x]` 标记已完成项。
3. 记录验证命令和结果。
4. 保留对后续工作有影响的未完成项。
## Codex Git PATH 修复任务

- [x] 复现当前 Codex shell 中裸 `git` 无法解析的问题。
- [x] 定位根因：Codex shell 未继承机器级 Git PATH，且 Codex `.env` 未优先暴露官方 Git 路径。
- [x] 更新 `C:\Users\dozen\.codex\.env` 并创建备份。
- [x] 在 `C:\Users\dozen\AppData\Local\UGit\bin` 创建 `git.cmd` shim，使当前 shell 立即可运行裸 `git`。
- [x] 验证 `git --version`、`git branch --show-current` 和 `git status --short --branch`。

## Codex Git PATH 修复验证

- 更新 `C:\Users\dozen\.codex\.env` 前已备份为 `C:\Users\dozen\.codex\.env.bak-20260708-174027`。
- 按 `.env` 重建 PATH 后：`where.exe git` 可见 `C:\Program Files\Git\cmd\git.exe`，`git --version` 返回 `git version 2.55.0.windows.2`，`git branch --show-current` 返回 `dev`。
- 当前 shell 裸命令：`git --version` 返回 `git version 2.55.0.windows.2`，`git branch --show-current` 返回 `dev`，`git status --short --branch` 可执行。
