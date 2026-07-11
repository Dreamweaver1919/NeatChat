/**
 * 文件上传和处理工具
 */

import React from "react";
import { showToast, showModal } from "../components/ui-lib-actions";

/**
 * 读取文件为文本
 * @param file 要读取的文件
 * @returns 文件内容的Promise
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  name: string;
  type: string;
  size: number;
  content: string;
  originalFile: File;
}

const MAX_ATTACHMENT_TEXT_LENGTH = 100000;

const SAFE_ATTACHMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "js",
  "mjs",
  "cjs",
  "lua",
  "luau",
  "as",
  "py",
  "html",
  "css",
  "json",
  "csv",
  "xml",
  "log",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "pdf",
  "sh",
  "bash",
  "zsh",
  "sql",
  "ini",
  "conf",
  "yaml",
  "yml",
  "toml",
  "tex",
  "c",
  "cpp",
  "h",
  "hpp",
  "java",
  "cs",
  "go",
  "rs",
  "php",
  "rb",
  "pl",
  "swift",
  "kt",
  "ts",
  "jsx",
  "tsx",
  "vue",
  "scss",
  "less",
  "laya",
  "ls",
  "lh",
  "lmat",
  "ltc",
  "atlas",
  "ani",
  "sk",
  "part",
  "prefab",
  "scene",
  "fire",
  "cocos",
  "cc",
  "meta",
  "plist",
  "fnt",
  "r",
  "m",
  "ipynb",
  "zip",
  "xlsx",
  "xls",
  "svg",
]);

const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "heic",
  "heif",
]);

const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt,.md,.js,.mjs,.cjs,.lua,.luau,.as,.py,.html,.css,.json,.csv,.xml,.log,.docx,.doc,.pptx,.ppt,.pdf,.sh,.bash,.zsh,.sql,.ini,.conf,.yaml,.yml,.toml,.tex,.c,.cpp,.h,.hpp,.java,.cs,.go,.rs,.php,.rb,.pl,.swift,.kt,.ts,.jsx,.tsx,.vue,.scss,.less,.laya,.ls,.lh,.lmat,.ltc,.atlas,.ani,.sk,.part,.prefab,.scene,.fire,.cocos,.cc,.meta,.plist,.fnt,.r,.m,.ipynb,.zip,.xlsx,.xls,.svg,Dockerfile";

const TEXT_ATTACHMENT_ACCEPT =
  ".txt,.md,.js,.mjs,.cjs,.lua,.luau,.as,.py,.html,.css,.json,.csv,.xml,.log,.sh,.bash,.zsh,.sql,.ini,.conf,.yaml,.yml,.toml,.tex,.c,.cpp,.h,.hpp,.java,.cs,.go,.rs,.php,.rb,.pl,.swift,.kt,.ts,.jsx,.tsx,.vue,.scss,.less,.laya,.ls,.lh,.lmat,.ltc,.atlas,.ani,.sk,.part,.prefab,.scene,.fire,.cocos,.cc,.meta,.plist,.fnt,.r,.m,.ipynb,.svg,Dockerfile";

const PASTED_DATA_IMAGE_PATTERN =
  /data:image\/(?:png|jpe?g|webp|heic|heif);base64,[a-z0-9+/=]+/gi;

function isPasteableImageUrl(url?: string | null) {
  if (!url) return false;
  const normalized = url.trim();
  return (
    /^data:image\/(?:png|jpe?g|webp|heic|heif);base64,/i.test(normalized) ||
    /^https?:\/\//i.test(normalized)
  );
}

export function extractClipboardImageUrls(clipboardData: DataTransfer) {
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  const addImageUrl = (url?: string | null) => {
    const normalized = url?.trim();
    if (!isPasteableImageUrl(normalized) || seen.has(normalized!)) {
      return;
    }
    seen.add(normalized!);
    imageUrls.push(normalized!);
  };

  const html = clipboardData.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("img").forEach((img) => {
      addImageUrl(img.getAttribute("src"));
    });
  }

  const text = clipboardData.getData("text/plain");
  if (text) {
    for (const match of text.matchAll(PASTED_DATA_IMAGE_PATTERN)) {
      addImageUrl(match[0]);
    }
  }

  return imageUrls;
}

/**
 * 添加 Word 文件读取函数
 * @param file 要读取的文件
 * @returns 文件内容的Promise
 */
async function readWordFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // 检查文件扩展名
        if (file.name.endsWith(".doc")) {
          // 显示弹窗提醒
          showModal({
            title: "检测到旧版 Word 文档",
            children: React.createElement(
              "div",
              null,
              React.createElement(
                "p",
                null,
                "您上传的是旧版 .doc 格式文件，无法完全解析其内容。",
              ),
              React.createElement(
                "p",
                null,
                "为获得最佳效果，请按照以下步骤转换文件：",
              ),
              React.createElement(
                "ol",
                null,
                React.createElement(
                  "li",
                  null,
                  "使用 Microsoft Word 或 WPS 打开文件",
                ),
                React.createElement("li", null, '点击"文件" > "另存为"'),
                React.createElement("li", null, '选择"Word 文档 (.docx)"格式'),
                React.createElement("li", null, "保存并上传新文件"),
              ),
              React.createElement(
                "p",
                null,
                "将尝试提取部分文本内容，但效果可能不理想。",
              ),
            ),
          });

          try {
            // 尝试使用二进制方式读取 .doc 文件内容
            // 这种方法不完美，但可以提取一些文本内容
            const uint8Array = new Uint8Array(arrayBuffer);
            let text = "";
            let inText = false;

            // 简单的文本提取算法
            for (let i = 0; i < uint8Array.length; i++) {
              const byte = uint8Array[i];
              // 如果是可打印ASCII字符
              if (byte >= 32 && byte <= 126) {
                if (!inText) inText = true;
                text += String.fromCharCode(byte);
              } else if (byte === 0 || byte === 13 || byte === 10) {
                // 空字符或换行
                if (inText) {
                  text += " ";
                  inText = false;
                }
              }
            }

            // 清理文本
            text = text.replace(/\s+/g, " ").trim();

            if (text.length > 100) {
              // 如果提取到足够的文本，则返回
              resolve(
                text +
                  "\n\n【注意】此文件为旧版 .doc 格式，文本提取可能不完整。为获得最佳效果，请将文件转换为 .docx 格式后再上传。",
              );
            } else {
              // 如果提取的文本太少，可能是二进制格式无法正确读取
              resolve(
                "【无法读取】此文件为旧版 .doc 格式，无法完全解析其内容。请将文件转换为 .docx 格式后再上传，或复制文件内容后直接粘贴。",
              );
            }
            return;
          } catch (docError) {
            // 如果二进制读取失败，返回友好提示
            resolve(
              "【无法读取】此文件为旧版 .doc 格式，无法解析其内容。请将文件转换为 .docx 格式后再上传，或复制文件内容后直接粘贴。",
            );
            return;
          }
        }

        // 使用 mammoth 将 .docx 文档转换为文本
        const mammoth = await import("mammoth");
        const mammothInput = { arrayBuffer, buffer: arrayBuffer };
        const result = await mammoth.extractRawText(mammothInput);
        resolve(result.value); // 返回纯文本内容
      } catch (error: any) {
        // 如果是 ZIP 相关错误，提供更友好的错误消息
        if (error.message && error.message.includes("zip file")) {
          // 显示弹窗提醒
          showModal({
            title: "文件格式错误",
            children: React.createElement(
              "div",
              null,
              React.createElement(
                "p",
                null,
                "无法读取此文件，可能是格式不正确或已损坏。",
              ),
              React.createElement(
                "p",
                null,
                "如果这是 .doc 格式文件，请按照以下步骤转换：",
              ),
              React.createElement(
                "ol",
                null,
                React.createElement(
                  "li",
                  null,
                  "使用 Microsoft Word 或 WPS 打开文件",
                ),
                React.createElement("li", null, '点击"文件" > "另存为"'),
                React.createElement("li", null, '选择"Word 文档 (.docx)"格式'),
                React.createElement("li", null, "保存并上传新文件"),
              ),
            ),
          });

          reject(
            new Error(
              "文件格式不正确或已损坏。如果是 .doc 格式，请转换为 .docx 格式后再上传。",
            ),
          );
        } else {
          reject(error);
        }
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 添加 PowerPoint 文件读取函数
 * @param file 要读取的文件
 * @returns 文件内容的Promise
 */
async function readPowerPointFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // 检查文件扩展名
        if (file.name.endsWith(".ppt")) {
          // 显示弹窗提醒
          showModal({
            title: "检测到旧版 PowerPoint 文档",
            children: React.createElement(
              "div",
              null,
              React.createElement(
                "p",
                null,
                "您上传的是旧版 .ppt 格式文件，无法完全解析其内容。",
              ),
              React.createElement(
                "p",
                null,
                "为获得最佳效果，请按照以下步骤转换文件：",
              ),
              React.createElement(
                "ol",
                null,
                React.createElement(
                  "li",
                  null,
                  "使用 PowerPoint 或 WPS 演示打开文件",
                ),
                React.createElement("li", null, '点击"文件" > "另存为"'),
                React.createElement(
                  "li",
                  null,
                  '选择"PowerPoint 演示文稿 (.pptx)"格式',
                ),
                React.createElement("li", null, "保存并上传新文件"),
              ),
              React.createElement(
                "p",
                null,
                "将尝试提取部分文本内容，但效果可能不理想。",
              ),
            ),
          });

          try {
            // 尝试使用二进制方式读取 .ppt 文件内容
            const uint8Array = new Uint8Array(arrayBuffer);
            let text = "";
            let inText = false;

            // 简单的文本提取算法
            for (let i = 0; i < uint8Array.length; i++) {
              const byte = uint8Array[i];
              if (byte >= 32 && byte <= 126) {
                if (!inText) inText = true;
                text += String.fromCharCode(byte);
              } else if (byte === 0 || byte === 13 || byte === 10) {
                if (inText) {
                  text += " ";
                  inText = false;
                }
              }
            }

            // 清理文本
            text = text.replace(/\s+/g, " ").trim();

            if (text.length > 100) {
              resolve(
                text +
                  "\n\n【注意】此文件为旧版 .ppt 格式，文本提取可能不完整。为获得最佳效果，请将文件转换为 .pptx 格式后再上传。",
              );
            } else {
              resolve(
                "【无法读取】此文件为旧版 .ppt 格式，无法完全解析其内容。请将文件转换为 .pptx 格式后再上传，或复制文件内容后直接粘贴。",
              );
            }
            return;
          } catch (pptError) {
            resolve(
              "【无法读取】此文件为旧版 .ppt 格式，无法解析其内容。请将文件转换为 .pptx 格式后再上传，或复制文件内容后直接粘贴。",
            );
            return;
          }
        }

        // 处理 .pptx 文件
        if (file.name.endsWith(".pptx")) {
          try {
            // 使用 JSZip 解压 .pptx 文件
            const JSZip = (await import("jszip")).default;
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(arrayBuffer);

            // 提取幻灯片内容
            let slideTexts: string[] = [];
            let slideCount = 0;

            // 查找所有幻灯片 XML 文件
            const slideRegex = /ppt\/slides\/slide(\d+)\.xml/;
            const slidePromises: Promise<void>[] = [];

            zipContent.forEach((path, file) => {
              if (slideRegex.test(path)) {
                slideCount++;
                const slidePromise = file.async("string").then((content) => {
                  // 从 XML 中提取文本
                  const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
                  if (textMatches) {
                    const slideNumber = parseInt(path.match(slideRegex)![1]);
                    const slideText = textMatches
                      .flatMap((match) => {
                        const text = match.replace(/<a:t>|<\/a:t>/g, "");
                        return text.trim().length > 0 ? [text] : [];
                      })
                      .join("\n");

                    if (slideText.trim()) {
                      slideTexts.push(
                        `--- 幻灯片 ${slideNumber} ---\n${slideText}`,
                      );
                    }
                  }
                });
                slidePromises.push(slidePromise);
              }
            });

            await Promise.all(slidePromises);

            // 按幻灯片编号排序
            slideTexts.sort((a, b) => {
              const numA = parseInt(a.match(/幻灯片 (\d+)/)![1]);
              const numB = parseInt(b.match(/幻灯片 (\d+)/)![1]);
              return numA - numB;
            });

            if (slideTexts.length > 0) {
              resolve(
                `PowerPoint 演示文稿内容：\n\n${slideTexts.join("\n\n")}`,
              );
            } else {
              resolve(
                "【提取失败】无法从 PowerPoint 文件中提取文本内容。可能是文件格式不支持或不包含文本。",
              );
            }
            return;
          } catch (pptxError) {
            console.error("解析 PPTX 失败:", pptxError);
            resolve(
              "【提取失败】无法解析 PowerPoint 文件内容。请尝试将重要内容复制后直接粘贴。",
            );
            return;
          }
        }

        // 如果不是 PowerPoint 文件，返回错误
        reject(new Error("不支持的文件格式"));
      } catch (error: any) {
        reject(error);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 添加 PDF 文件读取函数
 * @param file 要读取的文件
 * @returns 文件内容的Promise
 */
async function readPdfFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        try {
          // 动态导入 pdf.js
          const pdfjsLib = await import("pdfjs-dist");

          // 设置 worker 路径 - 适配 v4.x
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            try {
              // 尝试新版本路径
              const pdfjsWorker = await import(
                "pdfjs-dist/build/pdf.worker.mjs"
              );
              pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
            } catch (workerError) {
              // 如果失败，使用 CDN 版本
              pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
            }
          }

          // 加载 PDF 文档
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;

          // 提取文本内容
          let textContent = `PDF 文档内容 (共 ${pdf.numPages} 页):\n\n`;
          let hasContent = false;
          let emptyPageCount = 0;

          // 为大型文件设置页面限制
          const isLargeFile = file.size > 50 * 1024 * 1024; // 50MB
          const maxPagesToProcess = isLargeFile ? 30 : pdf.numPages;

          const pageNumbers = Array.from(
            { length: Math.min(maxPagesToProcess, pdf.numPages) },
            (_, index) => index + 1,
          );
          const pageResults = await Promise.all(
            pageNumbers.map(async (i) => {
              let pageText = "";
              let isEmpty = false;

              try {
                // 获取页面
                const page = await pdf.getPage(i);

                // 提取文本
                const content = await page.getTextContent();
                pageText = content.items.map((item: any) => item.str).join(" ");
                isEmpty = pageText.trim().length === 0;
              } catch (pageError) {
                return {
                  pageNumber: i,
                  text: `[无法解析此页]`,
                  isEmpty: false,
                };
              }

              return {
                pageNumber: i,
                text: isEmpty ? "[空白或图像内容]" : pageText,
                isEmpty,
              };
            }),
          );

          // 按页码顺序拼接，保持原输出顺序
          for (const pageResult of pageResults) {
            try {
              if (!pageResult.isEmpty && pageResult.text !== "[无法解析此页]") {
                hasContent = true;
                textContent += `--- 第 ${pageResult.pageNumber} 页 ---\n${pageResult.text}\n\n`;
              } else if (pageResult.isEmpty) {
                emptyPageCount++;
                textContent += `--- 第 ${pageResult.pageNumber} 页 ---\n${pageResult.text}\n\n`;
              } else {
                textContent += `--- 第 ${pageResult.pageNumber} 页 ---\n${pageResult.text}\n\n`;
              }
            } catch (pageError) {
              textContent += `--- 第 ${pageResult.pageNumber} 页 ---\n[无法解析此页]\n\n`;
            }
          }

          // 如果处理的页面数少于总页数
          if (maxPagesToProcess < pdf.numPages) {
            textContent += `\n[文件过大，仅处理了前 ${maxPagesToProcess} 页。总页数: ${pdf.numPages}]\n`;
          }

          // 检查是否所有页面都是空的
          if (
            !hasContent ||
            emptyPageCount === Math.min(maxPagesToProcess, pdf.numPages)
          ) {
            // 显示弹窗提醒
            showModal({
              title: "PDF 内容提取受限",
              children: React.createElement(
                "div",
                null,
                React.createElement(
                  "p",
                  null,
                  "无法从 PDF 提取文本内容，可能是以下原因：",
                ),
                React.createElement(
                  "ul",
                  null,
                  React.createElement(
                    "li",
                    null,
                    "PDF 是扫描版（图像而非文本）",
                  ),
                  React.createElement("li", null, "PDF 使用了内容保护或加密"),
                  React.createElement("li", null, "PDF 格式特殊或已损坏"),
                ),
                React.createElement("p", null, "建议："),
                React.createElement(
                  "ol",
                  null,
                  React.createElement("li", null, "使用 OCR 软件处理此 PDF"),
                  React.createElement("li", null, "手动复制需要的内容后粘贴"),
                  React.createElement("li", null, "尝试使用较小的 PDF 文件"),
                ),
              ),
            });

            resolve(
              `【PDF 内容提取受限】\n\n此 PDF 文件（${
                file.name
              }）无法提取文本内容，可能是扫描版或受保护的 PDF。\n\n文件信息：\n- 大小：${(
                file.size /
                (1024 * 1024)
              ).toFixed(2)} MB\n- 页数：${
                pdf.numPages
              } 页\n\n建议使用 OCR 软件处理此文件，或手动复制需要的内容。`,
            );
            return;
          }

          resolve(textContent);
        } catch (pdfError: any) {
          console.error("解析 PDF 失败:", pdfError);

          // 显示弹窗提醒
          showModal({
            title: "PDF 解析失败",
            children: React.createElement(
              "div",
              null,
              React.createElement("p", null, "无法解析 PDF 文件内容。"),
              React.createElement(
                "p",
                null,
                "错误信息: " + (pdfError.message || "未知错误"),
              ),
              React.createElement(
                "p",
                null,
                "请尝试使用其他 PDF 查看器打开文件，然后复制内容后直接粘贴。",
              ),
            ),
          });

          resolve(
            "【PDF 解析失败】无法提取 PDF 文件内容。请尝试使用 PDF 查看器打开文件，然后复制内容后直接粘贴。",
          );
        }
      } catch (error: any) {
        reject(error);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 添加 ZIP 文件读取函数
 * @param file 要读取的 ZIP 文件
 * @returns 文件内容的 Promise
 */
async function readZipFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        try {
          // 使用 JSZip 解压 ZIP 文件
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(arrayBuffer);

          // 提取文件列表和内容
          let fileContents: string[] = [];
          let fileCount = 0;
          let processedCount = 0;
          let textFileCount = 0;

          // 计算文件总数
          zipContent.forEach(() => {
            fileCount++;
          });

          // 设置最大处理文件数
          const maxFilesToProcess = 50;
          const isLargeZip = fileCount > maxFilesToProcess;

          // 处理每个文件
          const filePromises: Promise<void>[] = [];

          zipContent.forEach((path, zipEntry) => {
            // 跳过目录
            if (zipEntry.dir) return;

            // 限制处理文件数量
            if (processedCount >= maxFilesToProcess) return;
            processedCount++;

            const filePromise = (async () => {
              try {
                // 获取文件扩展名
                const ext = path.split(".").pop()?.toLowerCase();

                // 只处理文本文件
                const textExtensions = [
                  "txt",
                  "md",
                  "js",
                  "mjs",
                  "cjs",
                  "lua",
                  "luau",
                  "as",
                  "py",
                  "html",
                  "css",
                  "json",
                  "csv",
                  "xml",
                  "log",
                  "sh",
                  "bash",
                  "zsh",
                  "sql",
                  "ini",
                  "conf",
                  "yaml",
                  "yml",
                  "toml",
                  "c",
                  "cpp",
                  "h",
                  "hpp",
                  "java",
                  "cs",
                  "go",
                  "rs",
                  "php",
                  "rb",
                  "pl",
                  "swift",
                  "kt",
                  "ts",
                  "jsx",
                  "tsx",
                  "vue",
                  "scss",
                  "less",
                  "laya",
                  "ls",
                  "lh",
                  "lmat",
                  "ltc",
                  "atlas",
                  "ani",
                  "sk",
                  "part",
                  "prefab",
                  "scene",
                  "fire",
                  "cocos",
                  "cc",
                  "meta",
                  "plist",
                  "fnt",
                ];

                if (ext && textExtensions.includes(ext)) {
                  // 读取文本文件内容
                  const content = await zipEntry.async("string");

                  // 限制每个文件的内容长度
                  const maxContentLength = 10000;
                  const truncatedContent =
                    content.length > maxContentLength
                      ? content.substring(0, maxContentLength) +
                        `\n\n[文件过大，已截断。原文件大小: ${content.length} 字符]`
                      : content;

                  fileContents.push(
                    `=== ${path} ===\n\n${truncatedContent}\n\n`,
                  );
                  textFileCount++;
                } else {
                  // 使用 JSZip 的 API
                  const metadata = await zipEntry.async("uint8array");
                  fileContents.push(
                    `=== ${path} ===\n[二进制文件，大小: ${metadata.length} 字节]\n\n`,
                  );
                }
              } catch (fileError) {
                fileContents.push(`=== ${path} ===\n[无法读取此文件]\n\n`);
              }
            })();

            filePromises.push(filePromise);
          });

          await Promise.all(filePromises);

          // 构建结果
          let result = `ZIP 文件内容 (${file.name}):\n`;
          result += `总文件数: ${fileCount}`;

          if (isLargeZip) {
            result += ` (仅显示前 ${maxFilesToProcess} 个文件)`;
          }

          result += `\n文本文件数: ${textFileCount}\n\n`;
          result += fileContents.join("");

          if (isLargeZip) {
            result += `\n[ZIP 文件过大，仅处理了前 ${maxFilesToProcess} 个文件。总文件数: ${fileCount}]\n`;
          }

          if (textFileCount === 0) {
            // 显示弹窗提醒
            showModal({
              title: "ZIP 文件内容提取受限",
              children: React.createElement(
                "div",
                null,
                React.createElement(
                  "p",
                  null,
                  "此 ZIP 文件不包含可读取的文本文件，或文件格式不受支持。",
                ),
                React.createElement(
                  "p",
                  null,
                  "我们只能提取常见文本文件的内容，如 .txt, .md, .js, .py 等。",
                ),
                React.createElement(
                  "p",
                  null,
                  "建议解压 ZIP 文件后，单独上传需要的文本文件。",
                ),
              ),
            });
          }

          resolve(result);
        } catch (zipError: any) {
          console.error("解析 ZIP 失败:", zipError);

          // 显示弹窗提醒
          showModal({
            title: "ZIP 解析失败",
            children: React.createElement(
              "div",
              null,
              React.createElement("p", null, "无法解析 ZIP 文件内容。"),
              React.createElement(
                "p",
                null,
                "错误信息: " + (zipError.message || "未知错误"),
              ),
              React.createElement(
                "p",
                null,
                "请确保上传的是有效的 ZIP 文件，或尝试解压后单独上传文件。",
              ),
            ),
          });

          resolve(
            "【ZIP 解析失败】无法提取 ZIP 文件内容。请确保上传的是有效的 ZIP 文件，或尝试解压后单独上传文件。",
          );
        }
      } catch (error: any) {
        reject(error);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 添加 Excel 文件读取函数
 * @param file 要读取的文件
 * @returns 文件内容的Promise
 */
async function readExcelFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        // 检查文件扩展名
        if (file.name.endsWith(".xls")) {
          // 显示弹窗提醒
          showModal({
            title: "检测到旧版 Excel 文档",
            children: React.createElement(
              "div",
              null,
              React.createElement(
                "p",
                null,
                "您上传的是旧版 .xls 格式文件，可能无法完全解析其内容。",
              ),
              React.createElement(
                "p",
                null,
                "为获得最佳效果，请按照以下步骤转换文件：",
              ),
              React.createElement(
                "ol",
                null,
                React.createElement(
                  "li",
                  null,
                  "使用 Microsoft Excel 或 WPS 表格打开文件",
                ),
                React.createElement("li", null, '点击"文件" > "另存为"'),
                React.createElement(
                  "li",
                  null,
                  '选择"Excel 工作簿 (.xlsx)"格式',
                ),
                React.createElement("li", null, "保存并上传新文件"),
              ),
              React.createElement(
                "p",
                null,
                "将尝试提取表格内容，但效果可能不理想。",
              ),
            ),
          });
        }

        try {
          // 动态导入 xlsx 库
          const XLSX = await import("xlsx");

          // 读取 Excel 文件
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
            type: "array",
          });

          // 提取所有工作表内容
          let result = `Excel 表格内容 (${file.name}):\n\n`;

          // 获取所有工作表名称
          const sheetNames = workbook.SheetNames;
          result += `工作表数量: ${sheetNames.length}\n\n`;

          // 遍历每个工作表
          for (let i = 0; i < sheetNames.length; i++) {
            const sheetName = sheetNames[i];
            result += `=== 工作表: ${sheetName} ===\n\n`;

            // 获取工作表
            const worksheet = workbook.Sheets[sheetName];

            // 转换为 JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // 检查是否有数据
            if (jsonData.length === 0) {
              result += "[空工作表]\n\n";
              continue;
            }

            // 获取列宽度（用于格式化输出）
            const columnWidths: number[] = [];
            for (const row of jsonData) {
              if (Array.isArray(row)) {
                for (let j = 0; j < row.length; j++) {
                  const cellValue = String(row[j] || "");
                  columnWidths[j] = Math.max(
                    columnWidths[j] || 0,
                    cellValue.length,
                  );
                }
              }
            }

            // 限制列宽，防止过宽
            columnWidths.forEach((width, index) => {
              columnWidths[index] = Math.min(width, 30);
            });

            // 生成表格文本
            for (const row of jsonData) {
              if (Array.isArray(row)) {
                let rowText = "";
                for (let j = 0; j < row.length; j++) {
                  const cellValue = String(row[j] || "");
                  // 截断过长的单元格内容
                  const truncatedValue =
                    cellValue.length > columnWidths[j]
                      ? cellValue.substring(0, columnWidths[j] - 3) + "..."
                      : cellValue;
                  // 填充空格使列对齐
                  rowText += truncatedValue.padEnd(columnWidths[j] + 2);
                }
                result += rowText.trim() + "\n";
              }
            }

            result += "\n";
          }

          resolve(result);
        } catch (excelError: any) {
          console.error("解析 Excel 失败:", excelError);

          // 显示弹窗提醒
          showModal({
            title: "Excel 解析失败",
            children: React.createElement(
              "div",
              null,
              React.createElement("p", null, "无法解析 Excel 文件内容。"),
              React.createElement(
                "p",
                null,
                "错误信息: " + (excelError.message || "未知错误"),
              ),
              React.createElement(
                "p",
                null,
                "请尝试使用 Excel 打开文件，然后复制内容后直接粘贴。",
              ),
            ),
          });

          resolve(
            "【Excel 解析失败】无法提取 Excel 文件内容。请尝试使用 Excel 打开文件，然后复制内容后直接粘贴。",
          );
        }
      } catch (error: any) {
        reject(error);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 图片文件处理相关函数
 */

function isHeicImage(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

// 从chat.tsx移动过来的上传图片函数
async function uploadImage(file: File): Promise<string> {
  let imageBlob: Blob = file;

  if (isHeicImage(file)) {
    const mod = await import("heic2any");
    const heic2any = mod.default ?? mod;
    const converted = await heic2any({ blob: file, toType: "image/jpeg" });
    imageBlob = Array.isArray(converted) ? converted[0] : converted;
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 获取图片尺寸
        const width = img.width;
        const height = img.height;

        // 创建canvas来处理图片
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;

        // 计算缩放比例
        let targetWidth = width;
        let targetHeight = height;
        if (width > MAX_WIDTH) {
          targetWidth = MAX_WIDTH;
          targetHeight = (height * MAX_WIDTH) / width;
        }
        if (targetHeight > MAX_HEIGHT) {
          targetHeight = MAX_HEIGHT;
          targetWidth = (targetWidth * MAX_HEIGHT) / targetHeight;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // 绘制图片
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, targetWidth, targetHeight);

        // 转换为dataURL
        const dataUrl = canvas.toDataURL(
          imageBlob.type || file.type || "image/png",
        );
        resolve(dataUrl);
      };
      img.onerror = () => {
        reject(new Error("图片加载失败"));
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsDataURL(imageBlob);
  });
}

// 从chat.tsx移动过来的远程上传图片函数
async function uploadImageRemote(file: File): Promise<string> {
  try {
    return await uploadImage(file);
  } catch (error) {
    console.error("上传图片失败:", error);
    throw error;
  }
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized || !normalized.includes(".")) {
    return "";
  }

  return normalized.split(".").pop() ?? "";
}

function hasFileExtension(file: File, extensions: string[]) {
  const ext = getFileExtension(file.name);
  return extensions.includes(ext);
}

function isSvgFile(file: File) {
  return (
    hasFileExtension(file, ["svg"]) || file.type.toLowerCase().includes("svg")
  );
}

export function isAttachmentImage(file: File) {
  return (
    (file.type.startsWith("image/") ||
      IMAGE_ATTACHMENT_EXTENSIONS.has(getFileExtension(file.name))) &&
    !isSvgFile(file)
  );
}

const DRAG_ATTACHMENT_ADD_HINT = "释放后添加到输入框 · 最多3张图片、5个文件";
const DRAG_ATTACHMENT_BLOCKED_HINT = "释放后不会添加新附件";

type DraggedAttachmentEntry = {
  file?: File;
  type: string;
};

export type DraggedAttachmentSummary = {
  text: string;
  hint: string;
  willAdd: boolean;
};

function getDraggedAttachmentEntries(dataTransfer: DataTransfer) {
  const draggedFiles = Array.from(dataTransfer.files ?? []).map((file) => ({
    file,
    type: file.type || "",
  }));

  if (draggedFiles.length > 0) {
    return draggedFiles;
  }

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => {
      const file = item.getAsFile();

      return {
        file: file ?? undefined,
        type: file?.type || item.type || "",
      };
    });
}

function isDraggedAttachmentImage(entry: DraggedAttachmentEntry) {
  return entry.file
    ? isAttachmentImage(entry.file)
    : entry.type.startsWith("image/");
}

function getDraggedAttachmentLimitText(
  imageCount: number,
  fileCount: number,
  remainingImageSlots: number,
  remainingFileSlots: number,
) {
  const blockedParts: string[] = [];

  if (imageCount > 0 && remainingImageSlots <= 0) {
    blockedParts.push("图片已达 3 张上限");
  }
  if (fileCount > 0 && remainingFileSlots <= 0) {
    blockedParts.push("文件已达 5 个上限");
  }

  return blockedParts.length === 1 ? blockedParts[0] : "附件数量已达上限";
}

export function getDraggedAttachmentSummary(
  dataTransfer: DataTransfer,
  currentImageCount: number,
  currentFileCount: number,
): DraggedAttachmentSummary {
  const draggedEntries = getDraggedAttachmentEntries(dataTransfer);

  if (draggedEntries.length === 0) {
    return {
      text: "释放后识别附件",
      hint: DRAG_ATTACHMENT_ADD_HINT,
      willAdd: true,
    };
  }

  const imageCount = draggedEntries.filter((entry) =>
    isDraggedAttachmentImage(entry),
  ).length;
  const fileCount = draggedEntries.length - imageCount;
  const remainingImageSlots = Math.max(0, 3 - currentImageCount);
  const remainingFileSlots = Math.max(0, 5 - currentFileCount);
  const acceptedImageCount = Math.min(imageCount, remainingImageSlots);
  const acceptedFileCount = Math.min(fileCount, remainingFileSlots);
  const acceptedParts: string[] = [];

  if (acceptedImageCount > 0) {
    acceptedParts.push(`${acceptedImageCount} 张图片`);
  }
  if (acceptedFileCount > 0) {
    acceptedParts.push(`${acceptedFileCount} 个文件`);
  }
  if (acceptedParts.length === 0) {
    return {
      text: getDraggedAttachmentLimitText(
        imageCount,
        fileCount,
        remainingImageSlots,
        remainingFileSlots,
      ),
      hint: DRAG_ATTACHMENT_BLOCKED_HINT,
      willAdd: false,
    };
  }

  const hasOverflow =
    imageCount > remainingImageSlots || fileCount > remainingFileSlots;

  return {
    text: hasOverflow
      ? `将添加 ${acceptedParts.join("、")}，其余会自动忽略`
      : `将添加 ${acceptedParts.join("、")}`,
    hint: DRAG_ATTACHMENT_ADD_HINT,
    willAdd: true,
  };
}

export function isSupportedAttachmentFile(file: File) {
  if (isAttachmentImage(file)) {
    return true;
  }

  const fileName = file.name.trim().toLowerCase();
  if (fileName === "dockerfile") {
    return true;
  }

  const ext = getFileExtension(fileName);
  if (ext && SAFE_ATTACHMENT_EXTENSIONS.has(ext)) {
    return true;
  }
  if (ext) {
    return false;
  }

  const type = file.type.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("pdf") ||
    type.includes("msword") ||
    type.includes("officedocument") ||
    type.includes("spreadsheet") ||
    type.includes("presentation")
  );
}

function truncateAttachmentText(text: string) {
  return text.length > MAX_ATTACHMENT_TEXT_LENGTH
    ? text.substring(0, MAX_ATTACHMENT_TEXT_LENGTH) +
        `\n\n[文件过大，已截断。原文件大小: ${text.length} 字符]`
    : text;
}

export async function readAttachmentFile(file: File): Promise<FileInfo> {
  const lowerName = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  let text = "";

  if (isSvgFile(file)) {
    text = await readFileAsText(file);
  } else if (hasFileExtension(file, ["docx", "doc"]) || type.includes("word")) {
    text = await readWordFile(file);
  } else if (
    hasFileExtension(file, ["pptx", "ppt"]) ||
    type.includes("presentation") ||
    type.includes("powerpoint")
  ) {
    text = await readPowerPointFile(file);
  } else if (hasFileExtension(file, ["pdf"]) || type.includes("pdf")) {
    text = await readPdfFile(file);
  } else if (hasFileExtension(file, ["zip"]) || type.includes("zip")) {
    text = await readZipFile(file);
  } else if (
    hasFileExtension(file, ["xlsx", "xls"]) ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  ) {
    text = await readExcelFile(file);
  } else if (lowerName === "dockerfile" || isSupportedAttachmentFile(file)) {
    text = await readFileAsText(file);
  } else {
    throw new Error("不支持的文件类型");
  }

  return {
    name: file.name || "粘贴的文件.txt",
    type: file.type || getFileTypeByExtension(file.name),
    size: file.size,
    content: truncateAttachmentText(text),
    originalFile: file,
  };
}

export async function processAttachmentFiles(files: File[]) {
  const processedFiles = await Promise.all(
    files.map(async (file) => {
      if (!isSupportedAttachmentFile(file)) {
        showToast(`${file.name || "该文件"} 类型不支持`);
        return null;
      }

      try {
        if (isAttachmentImage(file)) {
          return {
            type: "image" as const,
            value: await uploadImageRemote(file),
          };
        }

        return {
          type: "file" as const,
          value: await readAttachmentFile(file),
        };
      } catch (error: any) {
        console.error(`读取文件 ${file.name} 失败:`, error);
        showToast(`读取文件 ${file.name} 失败: ${error.message || "未知错误"}`);
        return null;
      }
    }),
  );

  const fileInfos: FileInfo[] = [];
  const imageUrls: string[] = [];
  for (const item of processedFiles) {
    if (!item) continue;
    if (item.type === "image") {
      imageUrls.push(item.value);
    } else {
      fileInfos.push(item.value);
    }
  }

  return { fileInfos, imageUrls };
}

export interface AttachmentUploadOptions {
  remainingFileSlots?: number;
  remainingImageSlots?: number;
  processFile?: (file: File) => Promise<FileInfo>;
  processImage?: (file: File) => Promise<string>;
}

export interface SelectedAttachmentResult {
  fileInfos: FileInfo[];
  imageUrls: string[];
  imageFiles: File[];
  selectedFiles: File[];
  selectedImageFiles: File[];
  skippedFiles: number;
  skippedImages: number;
}

function selectAttachmentCandidates(
  files: Iterable<File>,
  options: AttachmentUploadOptions,
): Pick<
  SelectedAttachmentResult,
  "selectedFiles" | "selectedImageFiles" | "skippedFiles" | "skippedImages"
> {
  const remainingFileSlots = Math.max(
    0,
    options.remainingFileSlots ?? Infinity,
  );
  const remainingImageSlots = Math.max(
    0,
    options.remainingImageSlots ?? Infinity,
  );
  const selectedFiles: File[] = [];
  const selectedImageFiles: File[] = [];
  let skippedFiles = 0;
  let skippedImages = 0;

  for (const file of files) {
    if (isAttachmentImage(file)) {
      if (selectedImageFiles.length >= remainingImageSlots) {
        skippedImages += 1;
      } else {
        selectedImageFiles.push(file);
      }
    } else if (selectedFiles.length >= remainingFileSlots) {
      skippedFiles += 1;
    } else {
      selectedFiles.push(file);
    }
  }

  return { selectedFiles, selectedImageFiles, skippedFiles, skippedImages };
}

export async function processSelectedAttachments(
  files: Iterable<File>,
  options: AttachmentUploadOptions = {},
): Promise<SelectedAttachmentResult> {
  const selection = selectAttachmentCandidates(files, options);
  const processFile = options.processFile ?? readAttachmentFile;
  const processImage = options.processImage ?? uploadImageRemote;
  const fileInfos: FileInfo[] = [];
  const imageUrls: string[] = [];
  const imageFiles: File[] = [];

  for (const file of selection.selectedFiles) {
    try {
      fileInfos.push(await processFile(file));
    } catch (error: any) {
      console.error(`读取文件 ${file.name} 失败:`, error);
      showToast(`读取文件 ${file.name} 失败: ${error.message || "未知错误"}`);
    }
  }

  for (const file of selection.selectedImageFiles) {
    try {
      imageUrls.push(await processImage(file));
      imageFiles.push(file);
    } catch (error: any) {
      console.error(`读取文件 ${file.name} 失败:`, error);
      showToast(`读取文件 ${file.name} 失败: ${error.message || "未知错误"}`);
    }
  }

  return { fileInfos, imageUrls, imageFiles, ...selection };
}

/**
 * 上传附件（包括图片和文件）
 * @param onSuccess 上传成功的回调，接收文件、图片和原始选择结果
 * @param onError 上传失败的回调
 * @param onFinish 上传完成的回调（无论成功失败）
 */
export function uploadAttachments(
  onStart: () => void,
  onSuccess: (
    fileInfos: FileInfo[],
    imageUrls: string[],
    imageFiles: File[],
    result: SelectedAttachmentResult,
  ) => void,
  onError: (error: any) => void,
  onFinish: () => void,
  options: AttachmentUploadOptions = {},
): void {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ATTACHMENT_ACCEPT;
  fileInput.multiple = true;

  fileInput.onchange = async (event: any) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      onFinish();
      return;
    }

    onStart();
    try {
      const result = await processSelectedAttachments(Array.from(files), options);

      if (
        result.fileInfos.length > 0 ||
        result.imageUrls.length > 0 ||
        result.selectedFiles.length > 0 ||
        result.selectedImageFiles.length > 0 ||
        result.skippedFiles > 0 ||
        result.skippedImages > 0
      ) {
        onSuccess(result.fileInfos, result.imageUrls, result.imageFiles, result);
      } else {
        onError(new Error("没有成功读取任何文件"));
      }
    } catch (error) {
      console.error("处理文件失败:", error);
      onError(error);
    } finally {
      onFinish();
    }
  };

  fileInput.click();
}

/**
 * 根据文件扩展名获取文件类型
 * @param filename 文件名
 * @returns 文件类型
 */
export function getFileTypeByExtension(filename: string): string {
  // 特殊处理 Dockerfile（没有扩展名）
  if (filename.toLowerCase() === "dockerfile") {
    return "text/x-dockerfile";
  }

  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "docx":
    case "doc":
      return "application/msword";
    case "pptx":
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "txt":
      return "text/plain";
    case "html":
      return "text/html";
    case "js":
    case "mjs":
    case "cjs":
      return "application/javascript";
    case "lua":
      return "text/x-lua";
    case "luau":
      return "text/x-luau";
    case "as":
      return "text/x-actionscript";
    case "css":
      return "text/css";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "py":
      return "text/x-python";
    case "csv":
      return "text/csv";
    case "xml":
      return "application/xml";
    case "pdf":
      return "application/pdf";
    case "sh":
    case "bash":
    case "zsh":
      return "text/x-sh";
    case "bat":
    case "ps1":
      return "text/x-script";
    case "ini":
    case "conf":
      return "text/x-ini";
    case "yaml":
    case "yml":
      return "text/x-yaml";
    case "toml":
      return "text/x-toml";
    case "sql":
      return "text/x-sql";
    case "c":
    case "cpp":
    case "h":
    case "hpp":
      return "text/x-c";
    case "java":
      return "text/x-java";
    case "cs":
      return "text/x-csharp";
    case "go":
      return "text/x-go";
    case "rs":
      return "text/x-rust";
    case "php":
      return "text/x-php";
    case "rb":
      return "text/x-ruby";
    case "pl":
      return "text/x-perl";
    case "swift":
      return "text/x-swift";
    case "kt":
      return "text/x-kotlin";
    case "ts":
    case "tsx":
      return "text/x-typescript";
    case "jsx":
      return "text/x-jsx";
    case "vue":
      return "text/x-vue";
    case "scss":
    case "less":
      return "text/x-scss";
    case "laya":
    case "ls":
    case "lh":
    case "lmat":
    case "ltc":
      return "text/x-laya";
    case "atlas":
    case "ani":
    case "sk":
    case "part":
    case "prefab":
    case "scene":
    case "fire":
    case "cocos":
    case "cc":
    case "meta":
    case "plist":
    case "fnt":
      return "text/x-game-asset";
    case "r":
      return "text/x-r";
    case "m":
      return "text/x-matlab";
    case "tex":
      return "text/x-tex";
    case "ipynb":
      return "application/x-ipynb+json";
    case "zip":
      return "application/zip";
    case "csr":
      return "application/pkcs10";
    case "key":
      return "application/pkcs8";
    case "pem":
    case "crt":
    case "cer":
      return "application/x-x509-ca-cert";
    case "xlsx":
    case "xls":
      return "application/vnd.ms-excel";
    case "rdp":
      return "application/x-rdp";
    case "svg":
      return "image/svg+xml";
    default:
      return "文本文件";
  }
}

/**
 * 上传并处理单个文本文件
 */
function uploadTextFile(
  onStart: () => void,
  onSuccess: (fileInfo: FileInfo) => void,
  onError: (error: any) => void,
  onFinish: () => void,
): void {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = TEXT_ATTACHMENT_ACCEPT;

  fileInput.onchange = async (event: any) => {
    const file = event.target.files[0];
    if (!file) {
      onFinish();
      return;
    }

    onStart();
    try {
      const text = await readFileAsText(file);
      const maxLength = 5000;
      const truncatedText =
        text.length > maxLength
          ? text.substring(0, maxLength) +
            `\n\n[文件过大，已截断。原文件大小: ${text.length} 字符]`
          : text;

      onSuccess({
        name: file.name,
        type: file.type || "文本文件",
        size: file.size,
        content: truncatedText,
        originalFile: file,
      });
    } catch (error: any) {
      console.error("读取文件失败:", error);
      onError(error);
    } finally {
      onFinish();
    }
  };

  fileInput.click();
}

/**
 * 获取文件图标
 * 根据文件类型返回对应的图标类名
 */
export function getFileIconClass(fileType: string): string {
  const type = fileType.toLowerCase();

  if (
    type.includes("application/msword") ||
    type.includes("word") ||
    type.includes("docx") ||
    type.includes("doc")
  )
    return "file-word";
  if (
    type.includes("powerpoint") ||
    type.includes("presentation") ||
    type.includes("pptx") ||
    type.includes("ppt")
  )
    return "file-powerpoint";
  if (type.includes("text/plain")) return "file-text";
  if (type.includes("text/html") || type.includes("html")) return "file-html";
  if (type.includes("javascript") || type.includes("js")) return "file-js";
  if (type.includes("css")) return "file-css";
  if (type.includes("json")) return "file-json";
  if (type.includes("markdown") || type.includes("md")) return "file-md";
  if (type.includes("python") || type.includes("py")) return "file-py";
  if (type.includes("csv")) return "file-csv";
  if (type.includes("xml")) return "file-xml";
  if (type.includes("application/pdf") || type.includes("pdf"))
    return "file-pdf";

  // 脚本文件
  if (type.includes("x-sh") || type.includes("bash") || type.includes("shell"))
    return "file-sh";
  if (
    type.includes("x-script") ||
    type.includes("bat") ||
    type.includes("powershell")
  )
    return "file-script";

  // 配置文件
  if (type.includes("x-ini") || type.includes("conf")) return "file-conf";
  if (type.includes("x-yaml") || type.includes("yml")) return "file-yaml";
  if (type.includes("x-toml")) return "file-toml";

  // 数据库
  if (type.includes("x-sql")) return "file-sql";

  // 编程语言
  if (type.includes("x-c") || type.includes("cpp") || type.includes("c++"))
    return "file-c";
  if (type.includes("x-java")) return "file-java";
  if (type.includes("x-csharp") || type.includes("c#")) return "file-cs";
  if (type.includes("x-go")) return "file-go";
  if (type.includes("x-rust")) return "file-rs";
  if (type.includes("x-php")) return "file-php";
  if (type.includes("x-ruby")) return "file-rb";
  if (type.includes("x-perl")) return "file-pl";
  if (type.includes("x-lua") || type.includes("luau")) return "file-game-code";
  if (type.includes("actionscript")) return "file-game-code";
  if (type.includes("x-swift")) return "file-swift";
  if (type.includes("x-kotlin")) return "file-kt";
  if (type.includes("x-typescript")) return "file-ts";
  if (type.includes("x-jsx")) return "file-jsx";
  if (type.includes("x-vue")) return "file-vue";
  if (type.includes("x-scss") || type.includes("less")) return "file-scss";
  if (type.includes("x-laya") || type.includes("x-game-asset"))
    return "file-game-code";
  if (type.includes("x-r")) return "file-r";
  if (type.includes("x-matlab")) return "file-m";
  if (type.includes("x-tex")) return "file-tex";
  if (type.includes("ipynb") || type.includes("jupyter")) return "file-ipynb";
  if (type.includes("application/zip") || type.includes("zip"))
    return "file-zip";

  // 证书和密钥文件
  if (type.includes("pkcs10") || type.includes("csr")) return "file-csr";
  if (type.includes("pkcs8") || type.includes("key")) return "file-key";
  if (
    type.includes("x509") ||
    type.includes("cert") ||
    type.includes("pem") ||
    type.includes("crt") ||
    type.includes("cer")
  )
    return "file-cert";

  if (
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    type.includes("xlsx") ||
    type.includes("xls")
  )
    return "file-excel";

  // 远程桌面连接文件
  if (type.includes("x-rdp") || type.includes("rdp")) return "file-rdp";

  // SVG 文件
  if (type.includes("svg") || type.includes("image/svg")) return "file-svg";

  // Dockerfile
  if (type.includes("dockerfile") || type.includes("text/x-dockerfile"))
    return "file-dockerfile";

  return "file-document";
}

/**
 * 上传并处理多个文本文件
 * @param onStart 开始上传时的回调
 * @param onSuccess 上传成功的回调，接收文件信息对象数组
 * @param onError 上传失败的回调
 * @param onFinish 上传完成的回调（无论成功失败）
 */
function uploadMultipleTextFiles(
  onStart: () => void,
  onSuccess: (fileInfos: FileInfo[]) => void,
  onError: (error: any) => void,
  onFinish: () => void,
): void {
  // 调用新的uploadAttachments函数，但只返回文件信息
  uploadAttachments(
    onStart,
    (fileInfos, _) => onSuccess(fileInfos),
    onError,
    onFinish,
  );
}
