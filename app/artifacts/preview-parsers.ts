export const DOCUMENT_BLOCK_LIMIT = 120;
export const DOCUMENT_BLOCK_TEXT_LIMIT = 4_000;
export const LEGACY_TEXT_READ_LIMIT = 1024 * 1024;
export const STRUCTURED_PREVIEW_FILE_LIMIT = 16 * 1024 * 1024;
export const OFFICE_UNCOMPRESSED_LIMIT = 12 * 1024 * 1024;
export const LEGACY_SPREADSHEET_FILE_LIMIT = 4 * 1024 * 1024;
export const SPREADSHEET_ROW_LIMIT = 50;
export const SPREADSHEET_COLUMN_LIMIT = 32;
export const SPREADSHEET_SHEET_LIMIT = 20;
export const PRESENTATION_SLIDE_LIMIT = 60;
export const PRESENTATION_SLIDE_XML_LIMIT = 1024 * 1024;
export const ZIP_ENTRY_LIMIT = 100;
export const ZIP_TEXT_SAMPLE_LIMIT = 8_192;
export const ZIP_DIRECTORY_ENTRY_LIMIT = 2_000;
export const ZIP_UNCOMPRESSED_LIMIT = 64 * 1024 * 1024;
export const ZIP_COMPRESSION_RATIO_LIMIT = 100;

export interface DocumentPreviewData {
  type: "document";
  blocks: string[];
  truncated: boolean;
}

export interface SpreadsheetPreviewData {
  type: "spreadsheet";
  sheets: Array<{
    name: string;
    rows: string[][];
    truncated: boolean;
  }>;
  truncated: boolean;
}

export interface PresentationPreviewData {
  type: "presentation";
  slides: Array<{ index: number; blocks: string[]; truncated: boolean }>;
  truncated: boolean;
}

export interface ZipPreviewData {
  type: "zip";
  entries: Array<{
    path: string;
    directory: boolean;
    size: number;
    textSample?: string;
    textTruncated?: boolean;
  }>;
  truncated: boolean;
}

export type StructuredPreviewData =
  | DocumentPreviewData
  | SpreadsheetPreviewData
  | PresentationPreviewData
  | ZipPreviewData;

export interface StructuredPreviewResult {
  structured?: StructuredPreviewData;
  url?: string;
  warning?: string;
}

export interface ParseStructuredPreviewOptions {
  kind: "document" | "spreadsheet" | "presentation" | "zip" | "heic";
  extension: string;
  mimeType?: string;
  blob: Blob;
  signal?: AbortSignal;
}

export async function parseStructuredPreview({
  kind,
  extension,
  mimeType = "",
  blob,
  signal,
}: ParseStructuredPreviewOptions): Promise<StructuredPreviewResult> {
  throwIfAborted(signal);
  if (blob.size > STRUCTURED_PREVIEW_FILE_LIMIT) {
    throw new Error("This file is too large for a responsive local preview.");
  }
  await yieldForInteraction(signal);

  switch (kind) {
    case "document":
      return parseDocument(blob, extension, mimeType, signal);
    case "spreadsheet":
      return parseSpreadsheet(blob, extension, mimeType, signal);
    case "presentation":
      return parsePresentation(blob, extension, mimeType, signal);
    case "zip":
      return parseZip(blob, signal);
    case "heic":
      return parseHeic(blob, signal);
  }
}

export function structuredPreviewWarning(
  kind: ParseStructuredPreviewOptions["kind"],
): string {
  const label =
    kind === "document"
      ? "document"
      : kind === "spreadsheet"
      ? "spreadsheet"
      : kind === "presentation"
      ? "presentation"
      : kind === "zip"
      ? "archive"
      : "HEIC image";
  return `This ${label} could not be parsed. Showing binary metadata instead.`;
}

async function parseDocument(
  blob: Blob,
  extension: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<StructuredPreviewResult> {
  if (isLegacyOffice(extension, mimeType, "document")) {
    const legacy = await extractLegacyBlocks(blob, signal);
    if (legacy.blocks.length === 0)
      throw new Error("No compatible legacy text found.");
    return {
      warning: "Legacy DOC compatibility text may be incomplete.",
      structured: {
        type: "document",
        ...legacy,
      },
    };
  }

  const arrayBuffer = await readArrayBuffer(blob, signal);
  const safety = await validateZipContainer(
    new Uint8Array(arrayBuffer),
    signal,
  );
  assertOfficeBudget(safety);
  const parserBuffer = copyArrayBuffer(safety.parserBytes);
  const mammoth = await import("mammoth");
  throwIfAborted(signal);
  const result = await mammoth.extractRawText({
    arrayBuffer: parserBuffer,
    // Mammoth's Node entry point reads `buffer`; its browser build reads `arrayBuffer`.
    buffer: parserBuffer,
  } as unknown as { arrayBuffer: ArrayBuffer });
  throwIfAborted(signal);
  const normalized = toBoundedBlocks(result.value);
  if (normalized.blocks.length === 0)
    throw new Error("The document has no text.");
  return {
    structured: {
      type: "document",
      ...normalized,
    },
  };
}

async function parseSpreadsheet(
  blob: Blob,
  extension: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<StructuredPreviewResult> {
  const arrayBuffer = await readArrayBuffer(blob, signal);
  const parserBuffer = await validateSpreadsheetContainer(
    arrayBuffer,
    extension,
    mimeType,
    signal,
  );
  const XLSX = await import("xlsx");
  throwIfAborted(signal);
  const workbook = XLSX.read(new Uint8Array(parserBuffer), {
    type: "array",
  });
  throwIfAborted(signal);
  const sheetUtils = XLSX.utils as unknown as {
    decode_range(reference: string): {
      s: { r: number; c: number };
      e: { r: number; c: number };
    };
    sheet_to_json<T>(
      worksheet: unknown,
      options: {
        header: 1;
        range?: { s: { r: number; c: number }; e: { r: number; c: number } };
      },
    ): T[];
  };

  const visibleNames = workbook.SheetNames.slice(0, SPREADSHEET_SHEET_LIMIT);
  const sheets = visibleNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const reference = worksheet["!ref"] as string | undefined;
    const range = reference ? sheetUtils.decode_range(reference) : undefined;
    const boundedRange = range && {
      s: range.s,
      e: {
        r: Math.min(range.e.r, range.s.r + SPREADSHEET_ROW_LIMIT - 1),
        c: Math.min(range.e.c, range.s.c + SPREADSHEET_COLUMN_LIMIT - 1),
      },
    };
    const rows = boundedRange
      ? sheetUtils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          range: boundedRange,
        })
      : [];
    return {
      name,
      rows: rows.map((row) => row.map((value) => String(value ?? ""))),
      truncated: range
        ? range.e.r - range.s.r + 1 > SPREADSHEET_ROW_LIMIT ||
          range.e.c - range.s.c + 1 > SPREADSHEET_COLUMN_LIMIT
        : false,
    };
  });

  if (sheets.length === 0) throw new Error("The workbook has no sheets.");
  return {
    structured: {
      type: "spreadsheet",
      sheets,
      truncated:
        workbook.SheetNames.length > SPREADSHEET_SHEET_LIMIT ||
        sheets.some((sheet) => sheet.truncated),
    },
  };
}

async function validateSpreadsheetContainer(
  arrayBuffer: ArrayBuffer,
  extension: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const normalizedExtension = extension.toLowerCase();
  const header = new Uint8Array(arrayBuffer.slice(0, 8));
  if (isLegacyOffice(normalizedExtension, mimeType, "spreadsheet")) {
    if (arrayBuffer.byteLength > LEGACY_SPREADSHEET_FILE_LIMIT) {
      throw new Error("The legacy workbook is too large for local preview.");
    }
    if (!matchesBytes(header, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
      throw new Error("The XLS compound file signature is missing.");
    return arrayBuffer;
  }
  if (!isZipOffice(normalizedExtension, mimeType)) return arrayBuffer;

  const zip = await validateZipContainer(new Uint8Array(arrayBuffer), signal);
  assertOfficeBudget(zip);
  if (normalizedExtension === "xlsx" && !zip.entries.has("xl/workbook.xml"))
    throw new Error("The XLSX workbook entry is missing.");
  return copyArrayBuffer(zip.parserBytes);
}

async function parsePresentation(
  blob: Blob,
  extension: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<StructuredPreviewResult> {
  if (isLegacyOffice(extension, mimeType, "presentation")) {
    const legacy = await extractLegacyBlocks(blob, signal);
    if (legacy.blocks.length === 0)
      throw new Error("No compatible legacy text found.");
    return {
      warning: "Legacy PPT compatibility text may be incomplete.",
      structured: {
        type: "presentation",
        slides: [{ index: 1, ...legacy }],
        truncated: legacy.truncated,
      },
    };
  }

  const arrayBuffer = await readArrayBuffer(blob, signal);
  const safety = await validateZipContainer(
    new Uint8Array(arrayBuffer),
    signal,
  );
  assertOfficeBudget(safety);
  const JSZip = (await import("jszip")).default;
  throwIfAborted(signal);
  const archive = await JSZip.loadAsync(safety.parserBytes);
  throwIfAborted(signal);
  const slides = Object.values(archive.files)
    .map((entry) => {
      const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(entry.name);
      return match ? { entry, index: Number(match[1]) } : undefined;
    })
    .filter(
      (
        slide,
      ): slide is { entry: (typeof archive.files)[string]; index: number } =>
        Boolean(slide),
    )
    .sort((left, right) => left.index - right.index);
  if (slides.length === 0) throw new Error("The presentation has no slides.");
  if (
    slides.some(
      ({ entry }) =>
        (safety.entries.get(entry.name)?.uncompressedSize ?? 0) >
        PRESENTATION_SLIDE_XML_LIMIT,
    )
  ) {
    throw new Error("A presentation slide exceeds the local preview limit.");
  }

  const visibleSlides: PresentationPreviewData["slides"] = [];
  for (const { entry, index } of slides.slice(0, PRESENTATION_SLIDE_LIMIT)) {
    throwIfAborted(signal);
    const xml = await entry.async("string");
    throwIfAborted(signal);
    visibleSlides.push({ index, ...extractPptxText(xml) });
  }
  return {
    structured: {
      type: "presentation",
      slides: visibleSlides,
      truncated:
        slides.length > PRESENTATION_SLIDE_LIMIT ||
        visibleSlides.some((slide) => slide.truncated),
    },
  };
}

async function parseZip(
  blob: Blob,
  signal?: AbortSignal,
): Promise<StructuredPreviewResult> {
  const arrayBuffer = await readArrayBuffer(blob, signal);
  const safety = await validateZipContainer(
    new Uint8Array(arrayBuffer),
    signal,
  );
  const JSZip = (await import("jszip")).default;
  throwIfAborted(signal);
  const archive = await JSZip.loadAsync(safety.parserBytes);
  throwIfAborted(signal);
  const files = Object.values(archive.files);
  const entries: ZipPreviewData["entries"] = [];
  for (const entry of files.slice(0, ZIP_ENTRY_LIMIT)) {
    throwIfAborted(signal);
    const size = safety.entries.get(entry.name)?.uncompressedSize ?? 0;
    const preview = await zipTextSample(entry, size, signal);
    entries.push({
      path: entry.name,
      directory: entry.dir,
      size,
      ...preview,
    });
  }
  return {
    structured: {
      type: "zip",
      entries,
      truncated: files.length > ZIP_ENTRY_LIMIT,
    },
  };
}

async function parseHeic(
  blob: Blob,
  signal?: AbortSignal,
): Promise<StructuredPreviewResult> {
  const heic2any = (await import("heic2any")).default;
  throwIfAborted(signal);
  const converted = await heic2any({ blob, toType: "image/jpeg" });
  throwIfAborted(signal);
  const image = Array.isArray(converted) ? converted[0] : converted;
  if (!image) throw new Error("HEIC conversion returned no image.");
  const url = createObjectUrl(image);
  if (!url) throw new Error("Local object URLs are unavailable.");
  if (signal?.aborted) {
    URL.revokeObjectURL(url);
    throw createAbortError();
  }
  return { url };
}

async function extractLegacyBlocks(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ blocks: string[]; truncated: boolean }> {
  const bytes = new Uint8Array(
    await readArrayBuffer(blob.slice(0, LEGACY_TEXT_READ_LIMIT), signal),
  );
  throwIfAborted(signal);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 4_096) {
    const end = Math.min(bytes.length, offset + 4_096);
    let chunk = "";
    for (let index = offset; index < end; index += 1) {
      const byte = bytes[index];
      chunk += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : " ";
    }
    chunks.push(chunk);
  }
  const bounded = toBoundedBlocks(chunks.join(""));
  return {
    blocks: bounded.blocks,
    truncated: blob.size > LEGACY_TEXT_READ_LIMIT || bounded.truncated,
  };
}

function toBoundedBlocks(text: string): {
  blocks: string[];
  truncated: boolean;
} {
  const blocks = text
    .split(/\r?\n+/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const truncated =
    blocks.length > DOCUMENT_BLOCK_LIMIT ||
    blocks.some((block) => block.length > DOCUMENT_BLOCK_TEXT_LIMIT);
  return {
    blocks: blocks
      .slice(0, DOCUMENT_BLOCK_LIMIT)
      .map((block) => block.slice(0, DOCUMENT_BLOCK_TEXT_LIMIT)),
    truncated,
  };
}

function extractPptxText(xml: string): {
  blocks: string[];
  truncated: boolean;
} {
  return toBoundedBlocks(
    Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g), (match) =>
      decodeXmlText(match[1]),
    ).join("\n"),
  );
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

interface ZipSafetyEntry {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

interface ZipSafetyInfo {
  entries: Map<string, ZipSafetyEntry>;
  orderedEntries: ZipSafetyEntry[];
  parserBytes: Uint8Array;
  totalUncompressed: number;
}

async function validateZipContainer(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<ZipSafetyInfo> {
  const safety = inspectZipDirectory(bytes);
  await validateZipInflation(bytes, safety, signal);
  return safety;
}

function inspectZipDirectory(bytes: Uint8Array): ZipSafetyInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (
      readUint32(view, offset) === 0x06054b50 &&
      offset + 22 + readUint16(view, offset + 20) === bytes.length
    ) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("The ZIP directory is missing.");

  const entryCount = readUint16(view, endOffset + 10);
  const directorySize = readUint32(view, endOffset + 12);
  const directoryOffset = readUint32(view, endOffset + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    throw new Error("ZIP64 previews are not supported.");
  }
  if (entryCount > ZIP_DIRECTORY_ENTRY_LIMIT) {
    throw new Error("The archive contains too many entries.");
  }
  if (directoryOffset + directorySize > bytes.length) {
    throw new Error("The ZIP directory is invalid.");
  }

  const entries = new Map<string, ZipSafetyEntry>();
  const orderedEntries: ZipSafetyEntry[] = [];
  let offset = directoryOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) {
      throw new Error("The ZIP directory entry is invalid.");
    }
    const flags = readUint16(view, offset + 8);
    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (
      nextOffset > directoryOffset + directorySize ||
      nextOffset > bytes.length
    ) {
      throw new Error("The ZIP directory entry is truncated.");
    }
    if ((flags & 0x1) !== 0) {
      throw new Error("Encrypted ZIP entries cannot be previewed safely.");
    }
    if (![0, 8].includes(compressionMethod)) {
      throw new Error("This ZIP compression method is not supported.");
    }

    const ratio = uncompressedSize / Math.max(1, compressedSize);
    if (uncompressedSize > 1024 * 1024 && ratio > ZIP_COMPRESSION_RATIO_LIMIT) {
      throw new Error("The archive compression ratio is unsafe.");
    }
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > ZIP_UNCOMPRESSED_LIMIT) {
      throw new Error("The archive expands beyond the preview limit.");
    }

    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
    const entry = {
      path: decodeZipName(nameBytes),
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    };
    entries.set(entry.path, entry);
    orderedEntries.push(entry);
    offset = nextOffset;
  }
  if (
    totalUncompressed > 1024 * 1024 &&
    totalUncompressed / Math.max(1, totalCompressed) >
      ZIP_COMPRESSION_RATIO_LIMIT
  ) {
    throw new Error("The archive compression ratio is unsafe.");
  }
  const commentLength = readUint16(view, endOffset + 20);
  let parserBytes = bytes;
  if (commentLength > 0) {
    parserBytes = bytes.slice(0, endOffset + 22);
    new DataView(
      parserBytes.buffer,
      parserBytes.byteOffset,
      parserBytes.byteLength,
    ).setUint16(endOffset + 20, 0, true);
  }
  return { entries, orderedEntries, parserBytes, totalUncompressed };
}

async function validateZipInflation(
  bytes: Uint8Array,
  safety: ZipSafetyInfo,
  signal?: AbortSignal,
): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let actualTotal = 0;
  for (const entry of safety.orderedEntries) {
    throwIfAborted(signal);
    const offset = entry.localHeaderOffset;
    if (readUint32(view, offset) !== 0x04034b50) {
      throw new Error("The ZIP local header is invalid.");
    }
    const localMethod = readUint16(view, offset + 8);
    const nameLength = readUint16(view, offset + 26);
    const extraLength = readUint16(view, offset + 28);
    const dataOffset = offset + 30 + nameLength + extraLength;
    const dataEnd = dataOffset + entry.compressedSize;
    if (localMethod !== entry.compressionMethod || dataEnd > bytes.length) {
      throw new Error("The ZIP entry data is invalid.");
    }

    let actualSize = entry.compressedSize;
    if (entry.compressionMethod === 8) {
      actualSize = await measureDeflateOutput(
        bytes.slice(dataOffset, dataEnd),
        entry.uncompressedSize,
        ZIP_UNCOMPRESSED_LIMIT - actualTotal,
        signal,
      );
    }
    if (actualSize !== entry.uncompressedSize) {
      throw new Error("The ZIP entry size does not match its directory.");
    }
    actualTotal += actualSize;
    if (actualTotal > ZIP_UNCOMPRESSED_LIMIT) {
      throw new Error("The archive expands beyond the preview limit.");
    }
  }
}

async function measureDeflateOutput(
  compressed: Uint8Array,
  expectedSize: number,
  remainingLimit: number,
  signal?: AbortSignal,
): Promise<number> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot safely inspect compressed previews.");
  }
  const reader = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat))
    .getReader();
  let size = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) return size;
      size += value.byteLength;
      if (size > expectedSize || size > remainingLimit) {
        throw new Error("The ZIP entry expands beyond its declared limit.");
      }
    }
  } catch (reason) {
    try {
      await reader.cancel(reason);
    } catch {
      // Preserve the original parse or abort error.
    }
    throw reason;
  } finally {
    reader.releaseLock();
  }
}

function readUint16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength)
    throw new Error("The ZIP directory is truncated.");
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) return -1;
  return view.getUint32(offset, true);
}

function decodeZipName(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined")
    return new TextDecoder().decode(bytes);
  let name = "";
  for (const byte of bytes) name += String.fromCharCode(byte);
  return name;
}

type OfficeKind = "document" | "spreadsheet" | "presentation";

function assertOfficeBudget(safety: ZipSafetyInfo): void {
  if (safety.totalUncompressed > OFFICE_UNCOMPRESSED_LIMIT) {
    throw new Error("The Office file expands beyond the local preview limit.");
  }
}

function isLegacyOffice(
  extension: string,
  mimeType: string,
  kind: OfficeKind,
): boolean {
  const normalizedExtension = extension.toLowerCase();
  const legacyExtension =
    kind === "document" ? "doc" : kind === "spreadsheet" ? "xls" : "ppt";
  if (normalizedExtension === legacyExtension) return true;
  if (
    ["docx", "xlsx", "pptx", "odt", "ods", "odp"].includes(normalizedExtension)
  )
    return false;
  const normalizedMime = mimeType.toLowerCase();
  return kind === "document"
    ? normalizedMime === "application/msword"
    : kind === "spreadsheet"
    ? normalizedMime === "application/vnd.ms-excel"
    : normalizedMime === "application/vnd.ms-powerpoint";
}

function isZipOffice(extension: string, mimeType: string): boolean {
  return (
    ["docx", "xlsx", "pptx", "odt", "ods", "odp"].includes(
      extension.toLowerCase(),
    ) ||
    mimeType.toLowerCase().includes("openxmlformats") ||
    mimeType.toLowerCase().includes("opendocument")
  );
}

async function zipTextSample(
  entry: {
    dir: boolean;
    name: string;
    async(type: "string"): Promise<string>;
  },
  size: number,
  signal?: AbortSignal,
): Promise<
  Pick<ZipPreviewData["entries"][number], "textSample" | "textTruncated">
> {
  if (entry.dir || !isTextPath(entry.name)) return {};
  if (size > ZIP_TEXT_SAMPLE_LIMIT) return { textTruncated: true };
  const text = await entry.async("string");
  throwIfAborted(signal);
  return {
    textSample: text.slice(0, ZIP_TEXT_SAMPLE_LIMIT),
    ...(text.length > ZIP_TEXT_SAMPLE_LIMIT ? { textTruncated: true } : {}),
  };
}

function isTextPath(path: string): boolean {
  return /\.(?:csv|html?|json|log|md|txt|xml|ya?ml)$/i.test(path);
}

function matchesBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((byte, index) => bytes[index] === byte);
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function readArrayBuffer(
  blob: Blob,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  if (typeof blob.arrayBuffer === "function") {
    const arrayBuffer = await blob.arrayBuffer();
    throwIfAborted(signal);
    return arrayBuffer;
  }

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
    const abort = () =>
      settle(() => {
        reader.abort();
        reject(createAbortError());
      });
    signal?.addEventListener("abort", abort, { once: true });
    reader.onload = () => settle(() => resolve(reader.result as ArrayBuffer));
    reader.onerror = () =>
      settle(() =>
        reject(reader.error ?? new Error("Unable to read local file.")),
      );
    reader.onabort = () => settle(() => reject(createAbortError()));
    reader.readAsArrayBuffer(blob);
  });
}

function createObjectUrl(blob: Blob): string | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function")
    return undefined;
  return URL.createObjectURL(blob);
}

async function yieldForInteraction(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createAbortError();
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined")
    return new DOMException("The operation was aborted.", "AbortError");
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
