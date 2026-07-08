# Architecture

## 项目定位

NeatChat 是一个基于 Next.js、React、Zustand 和 Tauri 的 AI 聊天客户端。主业务运行在 Web/Next 层，Tauri 提供桌面壳和少量系统能力。项目重点是聊天会话、模型供应商接入、MCP 工具调用、访问控制、持久化和多端构建。

## 结构地图

```text
.
├── app/                         # 主应用源码
│   ├── api/                     # Next.js API routes 和模型供应商代理
│   │   ├── [provider]/[...path] # provider 统一分发入口
│   │   ├── openai.ts            # OpenAI/Azure 服务端处理
│   │   ├── google.ts            # Gemini 服务端处理
│   │   ├── anthropic.ts         # Anthropic 服务端处理
│   │   └── ...                  # 其他供应商处理
│   ├── client/                  # 前端模型客户端抽象
│   │   ├── api.ts               # ClientApi 分发入口
│   │   └── platforms/           # 各供应商客户端实现
│   ├── components/              # React UI 组件
│   │   ├── app-page.tsx         # 客户端启动逻辑
│   │   ├── home.tsx             # 应用壳、路由和布局
│   │   ├── chat.tsx             # 聊天主界面
│   │   ├── settings.tsx         # 设置页
│   │   ├── markdown.tsx         # Markdown 渲染
│   │   ├── mcp-market.tsx       # MCP 市场
│   │   └── sd/                  # 图像生成相关界面
│   ├── config/                  # 服务端/客户端配置读取
│   ├── mcp/                     # MCP 初始化、配置、执行、展示
│   ├── store/                   # Zustand 状态管理
│   │   ├── chat.ts              # 聊天会话和消息发送核心逻辑
│   │   ├── config.ts            # 用户设置和模型配置
│   │   ├── access.ts            # 访问控制和 API key 配置
│   │   └── ...                  # mask/plugin/sync/sd 等状态
│   ├── styles/                  # 全局样式和 Markdown 样式
│   ├── utils/                   # 通用工具、流处理、存储、文件处理
│   ├── layout.tsx               # Next.js 根布局
│   └── page.tsx                 # 应用入口页
├── public/                      # 静态资源、PWA manifest、service worker
├── scripts/                     # 辅助脚本
├── src-tauri/                   # Tauri 桌面端壳
│   ├── src/main.rs              # Tauri 主入口
│   ├── src/stream.rs            # 桌面端流式请求桥接
│   └── tauri.conf.json          # Tauri 配置
├── test/                        # Jest 测试
├── AGENTS.md                    # 智能体工作规范
├── architecture.md              # 项目结构地图
├── memory.md                    # 用户和智能体历史上下文
├── progress.md                  # 当前任务进度
├── verification.md              # 代码审核和验证工作流
├── next.config.mjs              # Next.js 构建、rewrite 和 webpack 配置
├── package.json                 # 脚本和依赖声明
├── tsconfig.json                # TypeScript 配置
└── yarn.lock                    # Yarn 1 锁文件
```

## 核心链路

```text
用户输入
-> app/components/chat.tsx
-> app/store/chat.ts:onUserInput()
-> getMessagesWithMemory()
-> app/client/api.ts:getClientApi()
-> app/client/platforms/*
-> app/api/* 或真实模型 endpoint
-> 流式回写 assistant 消息
-> 总结、统计、MCP JSON 检测和工具执行
```

## 维护规则

当目录结构、入口文件、核心模块职责、API 分发、状态管理、MCP 流程或构建方式变化时，必须同步更新本文件。


