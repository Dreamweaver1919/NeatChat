# Progress

## 当前任务

- [x] 确认待同步文件和 Git 状态。
- [x] 修正 `.gitignore`，保留仅移除 `progress.md` 忽略规则的必要差异。
- [x] 更新 `memory.md` 和 `progress.md` 记录本轮 GitHub 同步任务。
- [x] 暂存指定文件并提交。
- [x] 推送到 GitHub `origin/main`。

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

## 已知状态

- 项目依赖已安装。
- Git 和 Husky hooks 已可用。
- 当前已知测试问题：`test/gemini-visual-migration.test.ts` 存在样式断言失败。

## 维护规则

每次用户提供新任务时，智能体必须：

1. 新增或更新任务条目。
2. 使用 `[ ]` 标记未完成项，使用 `[x]` 标记已完成项。
3. 记录验证命令和结果。
4. 保留对后续工作有影响的未完成项。