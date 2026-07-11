# Multi-Format Artifact Preview Design

维护规则：本文件更新后必须保持 70 行以内，只保留关键决策、接口和验收标准。

Date: 2026-07-10
Status: approved

## Goal

让每个已保存文件都能打开稳定、非空白的本地预览；可解析格式提供内容视图，未知或损坏格式提供明确的元数据与下载降级。Office 文件采用结构化预览，不承诺像素级还原。

## Architecture

- 新建独立预览适配层，根据扩展名、MIME 和文件签名选择解析器。
- 统一输出 `ArtifactPreviewModel`，包含 `kind`、状态、标题、结构化内容、警告和释放函数。
- 页面只负责加载 Blob、显示即时骨架、渲染模型、取消过期请求和回收资源。
- 所有解析在浏览器本地完成；不上传文件，不调用第三方在线查看器。
- 解析器动态导入，避免增加文件库首屏和聊天主路径负担。

## Format Matrix

- PDF：PDF.js Canvas 分页渲染，渐进加载，替代 Safari 不稳定的 sandboxed Blob iframe。
- PNG/JPEG/GIF/WebP/SVG：受控图片预览；HEIC/HEIF 使用 `heic2any` 本地转换。
- TXT/代码/日志/JSON/XML/YAML/Markdown/HTML：转义文本或结构化文本；HTML 不执行脚本。
- CSV：解析为可滚动表格，同时保留原始文本回退。
- DOCX：Mammoth 转安全 HTML；DOC 显示兼容文本和格式限制提示。
- XLS/XLSX：XLSX 解析工作表，提供标签和按需渲染的表格行。
- PPTX：JSZip 提取逐页标题、正文和可用媒体；PPT 提供兼容文本预览。
- ZIP：显示目录树、大小和可读文本条目；限制展开数量和单条内容长度。
- 音频/视频：原始 Blob URL 配合浏览器原生媒体控件。
- 其他二进制：显示类型、大小、时间、文件签名/十六进制头部和下载按钮。

## Data Flow

1. 用户打开卡片后立即显示稳定尺寸骨架并记录请求序号。
2. Repository 按 ID 懒加载原始 Blob；元数据列表不读取 Blob。
3. Preview factory 创建带文件名的 `File`，选择解析器并产出统一模型。
4. 页面渐进显示页、表、幻灯片或目录；新请求使旧请求结果失效。
5. 关闭或切换时销毁 PDF 文档、撤销对象 URL，并把焦点还给原卡片。

## Performance Boundaries

- 点击后 100 ms 内显示骨架；暖态首个可读内容目标低于 500 ms（小文件）。
- PDF 首屏先渲染当前页；Office/ZIP 首批内容有上限，后续按需展开。
- 主线程长任务目标低于 50 ms；解析错误不得阻塞关闭、下载或其他卡片。
- 保持现有 25 MB 单文件与 250 MB 文件库限制，不复制 Blob 到持久化状态。

## Security and Errors

- 不执行 HTML、SVG、Office 或压缩包中的脚本、宏和外部链接。
- 对象 URL 仅在预览生命周期存在；文件名和提取文本只作为文本节点渲染。
- 加密、损坏、密码保护或不支持格式返回可操作错误，不显示永久加载或空白页。
- 每种失败状态保留原始文件下载；删除仍需确认且不影响聊天历史。

## Testing and Acceptance

- 单元测试覆盖格式识别、解析器选择、限制、取消、错误降级和资源释放。
- 组件测试覆盖骨架、PDF 页、Office 结构、媒体、ZIP、未知格式及焦点恢复。
- 浏览器验证 Safari 与 Chromium，1512x805 和 390x844，快速切换和大文件滚动。
- PDF 样本在 Safari 可见；所有矩阵格式均产生内容视图或明确降级，绝不为空白。
- Jest、TypeScript、Prettier、ESLint 和生产构建通过后才交付。
