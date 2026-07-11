# NeatChat Web UI Audit Notes

维护规则：本文件每次更新后必须保持 60 行以内；新证据替换旧摘要，禁止只追加。

## 2026-07-11 Multi-Format Preview

- 范围：`/#/artifacts` 的本地多格式解析、首帧反馈、快速切换、释放与错误恢复。
- 环境：standalone 生产包；Chromium 1512x805/390x844；Safari 中文深色主题。
- 数据：Safari 真实 982.5 KB/21 页 PDF、Chromium 真实 PNG、测试生成 Office/ZIP/二进制。

## 浏览器证据

- 图片预览桌面侧栏、移动全屏均无遮挡；Escape/返回恢复原按钮焦点并释放 URL。
- Safari PDF 不再使用空白 sandbox iframe；Canvas 800 ms 未完成即切本地 `<object>`。
- 真实 PDF 内容、21 页文本与图像在 Safari 原生回退完整可见并可连续滚动。
- PDF 正常 Canvas 路径支持骨架、适宽、翻页、缩放、取消和串行 worker 销毁。
- Chromium 控制台无应用错误；运行时 Google Font 外部请求已移除。

## 已改进

- 统一类型检测与预览模型；原始 Blob 始终保留，未知/损坏文件显示元数据和 hex。
- DOCX/Mammoth、XLS(X)/SheetJS、PPTX/ZIP XML、ZIP 树与 HEIC 转换均动态加载。
- 文本/HTML/SVG 只作为转义文本或安全图片呈现，不执行脚本/宏。
- ZIP/OOXML 解析前校验目录、条目数、压缩比，并流式核对实际展开字节数。
- 快速切换通过 AbortController 和请求序号阻止旧结果覆盖；对象 URL 幂等释放。
- 中英文错误、PDF 控件、截断提示、工作表/幻灯片/二进制文案已补齐。

## 待持续观察

- 旧 Safari 无 `DecompressionStream(deflate-raw)` 时安全回退二进制，不做结构化解压。
- Office/HEIC 浏览器视觉覆盖使用生成样本与组件测试；发布前可补真实复杂版式图库。
- standalone 连续构建前需移走旧产物，避免其 node_modules 符号链接影响共享依赖。

## 自动化证据

- Jest 11 suites / 80 tests、TypeScript、Prettier、目标 ESLint 与生产构建通过。

## 约束检查

- 本文件、`debug-plan.md`、`AGENTS.md` 每次修改后执行 `wc -l`，均须 <=60 行。
