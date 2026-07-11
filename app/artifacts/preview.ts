import type { ArtifactMetadata } from "./library";
import {
  parseStructuredPreview,
  structuredPreviewWarning,
  type StructuredPreviewData,
} from "./preview-parsers";

export const TEXT_PREVIEW_LIMIT = 1024 * 1024;
export const BINARY_HEX_PREVIEW_LIMIT = 512;

export type ArtifactPreviewType =
  | "text"
  | "image"
  | "heic"
  | "media"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "zip"
  | "binary";

export type ArtifactPreviewStatus = "ready" | "unsupported";

export interface ArtifactPreviewModel {
  kind: ArtifactPreviewType;
  status: ArtifactPreviewStatus;
  title: string;
  mimeType: string;
  size: number;
  updatedAt: number;
  blob: Blob;
  content?: string;
  structured?: StructuredPreviewData;
  hex?: string;
  truncated?: boolean;
  url?: string;
  mediaType?: "audio" | "video";
  warning?: string;
}

const TEXT_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "csv",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "opus",
  "wav",
]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mkv", "mov", "mp4", "webm"]);
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf"]);
const SPREADSHEET_EXTENSIONS = new Set(["ods", "xls", "xlsx"]);
const PRESENTATION_EXTENSIONS = new Set(["odp", "ppt", "pptx"]);
const JSON_MIME_TYPES = new Set(["application/json", "application/ld+json"]);
const TEXT_MIME_TYPES = new Set([
  "application/javascript",
  "application/sql",
  "application/x-javascript",
  "application/xml",
  "application/x-yaml",
]);
const disposedPreviews = new WeakSet<ArtifactPreviewModel>();

export async function detectPreviewType(
  metadata: ArtifactMetadata,
  blob: Blob,
  signal?: AbortSignal,
): Promise<ArtifactPreviewType> {
  throwIfAborted(signal);

  const hintedType = detectHintedType(metadata);
  if (hintedType) return hintedType;

  const header = await readBytes(blob.slice(0, 32), signal);
  throwIfAborted(signal);
  return detectSignatureType(header);
}

export async function createArtifactPreview(
  metadata: ArtifactMetadata,
  blob: Blob,
  signal?: AbortSignal,
): Promise<ArtifactPreviewModel> {
  throwIfAborted(signal);
  const kind = await detectPreviewType(metadata, blob, signal);
  throwIfAborted(signal);

  const base = {
    kind,
    title: metadata.name,
    mimeType: metadata.mimeType || blob.type,
    size: blob.size,
    updatedAt: metadata.updatedAt,
    blob,
  };

  if (kind === "text") {
    const content = await readText(blob.slice(0, TEXT_PREVIEW_LIMIT), signal);
    throwIfAborted(signal);
    return {
      ...base,
      status: "ready",
      content,
      truncated: blob.size > TEXT_PREVIEW_LIMIT,
    };
  }

  if (kind === "binary") {
    return createBinaryPreview(base, blob, signal);
  }

  if (kind === "image" || kind === "media" || kind === "pdf") {
    const mediaType =
      kind === "media"
        ? await detectMediaType(metadata, blob, signal)
        : undefined;
    throwIfAborted(signal);
    const url = createObjectUrl(blob);
    if (url) {
      return {
        ...base,
        status: "ready",
        url,
        ...(mediaType ? { mediaType } : {}),
      };
    }
    return {
      ...base,
      status: "unsupported",
      warning: "Local object URLs are unavailable.",
      ...(mediaType ? { mediaType } : {}),
    };
  }

  if (isStructuredPreviewType(kind)) {
    try {
      const parsed = await parseStructuredPreview({
        kind,
        extension: metadata.extension,
        mimeType: metadata.mimeType,
        blob,
        signal,
      });
      throwIfAborted(signal);
      return {
        ...base,
        status: "ready",
        ...parsed,
      };
    } catch (error) {
      throwIfAborted(signal);
      return createBinaryPreview(
        base,
        blob,
        signal,
        structuredPreviewWarning(kind),
      );
    }
  }

  return {
    ...base,
    status: "unsupported",
    warning: unsupportedWarning(kind),
  };
}

function isStructuredPreviewType(
  kind: ArtifactPreviewType,
): kind is "document" | "spreadsheet" | "presentation" | "zip" | "heic" {
  return (
    kind === "document" ||
    kind === "spreadsheet" ||
    kind === "presentation" ||
    kind === "zip" ||
    kind === "heic"
  );
}

async function createBinaryPreview(
  base: Omit<ArtifactPreviewModel, "status" | "hex" | "truncated" | "warning">,
  blob: Blob,
  signal?: AbortSignal,
  warning?: string,
): Promise<ArtifactPreviewModel> {
  const bytes = await readBytes(
    blob.slice(0, BINARY_HEX_PREVIEW_LIMIT),
    signal,
  );
  throwIfAborted(signal);
  return {
    ...base,
    status: warning ? "unsupported" : "ready",
    hex: bytesToHex(bytes),
    truncated: blob.size > BINARY_HEX_PREVIEW_LIMIT,
    ...(warning ? { warning } : {}),
  };
}

export function disposeArtifactPreview(model: ArtifactPreviewModel): void {
  if (disposedPreviews.has(model)) return;
  disposedPreviews.add(model);

  if (
    model.url &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(model.url);
  }
}

function detectHintedType(
  metadata: ArtifactMetadata,
): ArtifactPreviewType | undefined {
  const extension = metadata.extension.toLowerCase();
  const mimeType = metadata.mimeType.toLowerCase();

  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    HEIC_EXTENSIONS.has(extension)
  )
    return "heic";
  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension))
    return "image";
  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension))
    return "media";
  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension))
    return "media";
  if (DOCUMENT_EXTENSIONS.has(extension) || isDocumentMimeType(mimeType))
    return "document";
  if (SPREADSHEET_EXTENSIONS.has(extension) || isSpreadsheetMimeType(mimeType))
    return "spreadsheet";
  if (
    PRESENTATION_EXTENSIONS.has(extension) ||
    isPresentationMimeType(mimeType)
  )
    return "presentation";
  if (extension === "zip" || mimeType === "application/zip") return "zip";
  if (
    TEXT_EXTENSIONS.has(extension) ||
    mimeType.startsWith("text/") ||
    JSON_MIME_TYPES.has(mimeType) ||
    TEXT_MIME_TYPES.has(mimeType)
  )
    return "text";
  return undefined;
}

function detectSignatureType(bytes: Uint8Array): ArtifactPreviewType {
  if (matchesAscii(bytes, 0, "%PDF")) return "pdf";
  if (matchesBytes(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image";
  if (matchesAscii(bytes, 0, "GIF8")) return "image";
  if (matchesBytes(bytes, [0xff, 0xd8, 0xff])) return "image";
  if (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WEBP"))
    return "image";
  if (isAudioSignature(bytes)) return "media";
  if (
    matchesAscii(bytes, 0, "PK\u0003\u0004") ||
    matchesAscii(bytes, 0, "PK\u0005\u0006")
  )
    return "zip";
  if (matchesAscii(bytes, 4, "ftyp")) {
    const brand = asciiBrand(bytes);
    if (["avif", "avis"].includes(brand)) return "image";
    if (
      [
        "heic",
        "heif",
        "heix",
        "hevc",
        "hevx",
        "mif1",
        "heim",
        "heis",
        "hevm",
        "hevs",
      ].includes(brand)
    )
      return "heic";
    return "media";
  }
  return "binary";
}

function isDocumentMimeType(mimeType: string): boolean {
  return (
    mimeType === "application/msword" || mimeType.includes("wordprocessingml")
  );
}

function isSpreadsheetMimeType(mimeType: string): boolean {
  return (
    mimeType === "application/vnd.ms-excel" ||
    mimeType.includes("spreadsheetml")
  );
}

function isPresentationMimeType(mimeType: string): boolean {
  return (
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType.includes("presentationml")
  );
}

async function detectMediaType(
  metadata: ArtifactMetadata,
  blob: Blob,
  signal?: AbortSignal,
): Promise<"audio" | "video"> {
  const mimeType = metadata.mimeType.toLowerCase();
  const extension = metadata.extension.toLowerCase();
  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension))
    return "audio";
  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension))
    return "video";

  const bytes = await readBytes(blob.slice(0, 32), signal);
  throwIfAborted(signal);
  if (isAudioSignature(bytes)) return "audio";
  if (matchesAscii(bytes, 4, "ftyp")) {
    const brand = asciiBrand(bytes);
    if (["M4A ", "M4B ", "M4P ", "F4A ", "F4B "].includes(brand))
      return "audio";
  }
  return "video";
}

function isAudioSignature(bytes: Uint8Array): boolean {
  return (
    (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WAVE")) ||
    matchesAscii(bytes, 0, "ID3") ||
    matchesAscii(bytes, 0, "OggS") ||
    matchesAscii(bytes, 0, "fLaC") ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

function asciiBrand(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(8, 12));
}

function unsupportedWarning(kind: ArtifactPreviewType): string {
  switch (kind) {
    case "heic":
      return "HEIC conversion is not available yet.";
    case "document":
      return "Document parsing is not available yet.";
    case "spreadsheet":
      return "Spreadsheet parsing is not available yet.";
    case "presentation":
      return "Presentation parsing is not available yet.";
    case "zip":
      return "Archive parsing is not available yet.";
    default:
      return "This file type is not available for preview.";
  }
}

function createObjectUrl(blob: Blob): string | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function")
    return undefined;
  return URL.createObjectURL(blob);
}

async function readText(blob: Blob, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  if (typeof blob.text === "function") {
    const text = await blob.text();
    throwIfAborted(signal);
    return text;
  }
  return readWithFileReader(blob, "text", signal);
}

async function readBytes(
  blob: Blob,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (typeof blob.arrayBuffer === "function") {
    const buffer = await blob.arrayBuffer();
    throwIfAborted(signal);
    return new Uint8Array(buffer);
  }
  return new Uint8Array(await readWithFileReader(blob, "array-buffer", signal));
}

function readWithFileReader(
  blob: Blob,
  mode: "text",
  signal?: AbortSignal,
): Promise<string>;
function readWithFileReader(
  blob: Blob,
  mode: "array-buffer",
  signal?: AbortSignal,
): Promise<ArrayBuffer>;
function readWithFileReader(
  blob: Blob,
  mode: "text" | "array-buffer",
  signal?: AbortSignal,
): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("This browser cannot read local files."));
      return;
    }

    const reader = new FileReader();
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reader.abort();
      reject(createAbortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    reader.onload = () =>
      settle(() => resolve(reader.result as string | ArrayBuffer));
    reader.onerror = () =>
      settle(() =>
        reject(reader.error ?? new Error("Unable to read local file.")),
      );
    reader.onabort = () => settle(() => reject(createAbortError()));
    if (mode === "text") reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    " ",
  );
}

function matchesBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((byte, index) => bytes[index] === byte);
}

function matchesAscii(
  bytes: Uint8Array,
  offset: number,
  expected: string,
): boolean {
  return Array.from(expected).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined")
    return new DOMException("The operation was aborted.", "AbortError");
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
