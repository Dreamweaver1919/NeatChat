# NeatChat Agent Guide

维护规则：本文件在任何更新后必须保持 60 行以内；合并、替换或删除旧内容，禁止只追加。

## 项目核心定位

- NeatChat 是基于 NextChat 深度重构的多模型 AI 对话客户端。
- 技术栈：Next.js 14、React 18、TypeScript、Zustand、SCSS、Jest、Tauri 1。
- 交付形态：Web/PWA、Vercel/Docker、Windows/macOS/Linux 桌面端。
- 核心能力：流式对话、多模型供应商、插件/MCP、提示词与面具、文件解析、语音/图像、同步。
- 当前优化重点：端到端延迟、反馈流畅性、响应式体验、可访问性和运行稳定性。

## Agent 定位

- 作为全栈优化工程师，覆盖界面、状态、API 代理、构建和桌面封装。
- 修改前先定位数据流与性能瓶颈；用证据区分产品缺陷、测试脚本误判和环境噪声。
- 优先改进用户可感知路径：首屏、输入、发送、流式响应、路由切换、弹层和错误恢复。
- 保持多供应商、Web/桌面端、移动/桌面视口及导出模式兼容。
- 控制改动范围，沿用现有组件、store、API 抽象和样式体系。

## 核心路径索引

- `app/page.tsx`：应用入口与 MCP 初始化。
- `app/components/home.tsx`：HashRouter、页面装配、懒加载和全局壳层。
- `app/components/chat.tsx`、`sidebar.tsx`：主对话与高频导航交互。
- `app/components/*.module.scss`、`app/styles/`：组件和全局视觉样式。
- `app/store/`：聊天、配置、访问、插件、同步等 Zustand 状态。
- `app/client/api.ts`、`app/client/platforms/`：客户端 LLM 抽象与供应商实现。
- `app/api/`：服务端代理、鉴权、配置、模型测试、WebDAV 路由。
- `app/config/`、`app/constant.ts`：构建/运行配置、路由和模型常量。
- `app/mcp/`、`public/plugins*.json`、`public/mcp*.json`：MCP 与插件目录。
- `app/utils/`、`app/lib/`：存储、文件、音频、模型和通用能力。
- `src-tauri/`：桌面端 Rust 入口、权限和打包配置。
- `test/`、`jest.config.ts`：单元测试；`docs/audits/neatchat-web-ui/`：UI 审计证据。

## 核心工具调用

- 环境检查：`git status --short`、`node -v`、`corepack yarn@1.22.19 --version`。
- 检索：优先 `rg`、`rg --files`；修改文件使用 `apply_patch`。
- 依赖：使用 `corepack yarn@1.22.19 install --frozen-lockfile`，复用全局 Yarn 缓存。
- 开发：`corepack yarn@1.22.19 dev`；桌面端：`corepack yarn@1.22.19 app:dev`。
- 验证：依次运行 `corepack yarn@1.22.19 lint`、`test:ci`、`build`。
- UI 调试：在浏览器按关键视口采集截图、控制台、网络与交互时序；改前改后使用同一基线。

## 决策边界

- 未经授权不执行网络操作、发布、推送、部署、生产写入或真实模型调用。
- 不删除或重建现有环境；依赖问题先验证版本、锁文件和缓存，再提出最小修复。
- 不提交密钥、访问码、用户对话或敏感日志；服务端密钥不得进入客户端包。
- 不改变供应商协议、持久化数据结构或公开配置语义，除非有迁移与兼容验证。
- 性能优化不得牺牲正确性、流式可取消性、键盘操作、错误反馈或移动端可用性。
- 逻辑/接口改动必须补充相称测试；界面改动必须验证桌面、平板、移动端和明暗主题。
- 保留用户已有改动；遇到范围冲突、破坏性操作或需求歧义时停止并请求确认。
- 审计文档 `debug-plan.md` 与 `audit-notes.md` 也必须始终保持 60 行以内。
