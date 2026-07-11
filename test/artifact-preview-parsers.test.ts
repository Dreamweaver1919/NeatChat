import JSZip from "jszip";
import * as XLSX from "xlsx";
import { TextDecoder as NodeTextDecoder } from "util";
import {
  createArtifactPreview,
  disposeArtifactPreview,
} from "../app/artifacts/preview";
import {
  LEGACY_TEXT_READ_LIMIT,
  OFFICE_UNCOMPRESSED_LIMIT,
  PRESENTATION_SLIDE_XML_LIMIT,
  SPREADSHEET_ROW_LIMIT,
  ZIP_ENTRY_LIMIT,
  ZIP_TEXT_SAMPLE_LIMIT,
  parseStructuredPreview,
} from "../app/artifacts/preview-parsers";
import type { ArtifactMetadata } from "../app/artifacts/library";

const mockHeic2any = jest.fn(async () => new Blob(["converted"]));

if (typeof TextDecoder === "undefined") {
  Object.assign(global, { TextDecoder: NodeTextDecoder });
}

jest.mock("heic2any", () => ({
  __esModule: true,
  default: mockHeic2any,
}));

function metadata(overrides: Partial<ArtifactMetadata> = {}): ArtifactMetadata {
  return {
    id: "artifact-1",
    fingerprint: "artifact-1",
    name: "artifact.bin",
    mimeType: "application/octet-stream",
    extension: "bin",
    category: "other",
    size: 0,
    createdAt: 1,
    updatedAt: 1,
    lastModified: 1,
    ...overrides,
  };
}

async function docxFixture(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Document title</w:t></w:r></w:p><w:p><w:r><w:t>Document body</w:t></w:r></w:p></w:body></w:document>',
  );
  return new Blob([await zip.generateAsync({ type: "uint8array" })]);
}

function spreadsheetFixture(bookType = "xlsx"): Blob {
  const sheetJs = XLSX as unknown as {
    utils: {
      aoa_to_sheet(rows: unknown[][]): unknown;
      book_new(): { SheetNames: string[]; Sheets: Record<string, unknown> };
      book_append_sheet(
        workbook: { SheetNames: string[]; Sheets: Record<string, unknown> },
        sheet: unknown,
        name: string,
      ): void;
    };
    write(
      workbook: unknown,
      options: { bookType: string; type: "array" },
    ): ArrayBuffer;
  };
  const rows = Array.from({ length: SPREADSHEET_ROW_LIMIT + 2 }, (_, index) => [
    `row-${index}`,
    index,
  ]);
  const workbook = sheetJs.utils.book_new();
  sheetJs.utils.book_append_sheet(
    workbook,
    sheetJs.utils.aoa_to_sheet(rows),
    "Data",
  );
  return new Blob([sheetJs.write(workbook, { bookType, type: "array" })]);
}

async function pptxFixture(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide2.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Second slide</a:t></p:sld>',
  );
  zip.file(
    "ppt/slides/slide1.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>First slide</a:t></p:sld>',
  );
  return new Blob([await zip.generateAsync({ type: "uint8array" })]);
}

async function zipFixture(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("notes/readme.txt", "sample text");
  zip.file("notes/large.txt", "x".repeat(ZIP_TEXT_SAMPLE_LIMIT + 1));
  for (let index = 0; index < ZIP_ENTRY_LIMIT + 2; index++) {
    zip.file(`files/${index}.bin`, "x");
  }
  return new Blob([await zip.generateAsync({ type: "uint8array" })]);
}

test("parses DOCX text into bounded document blocks while preserving the Blob", async () => {
  const blob = await docxFixture();

  await expect(
    parseStructuredPreview({ kind: "document", extension: "docx", blob }),
  ).resolves.toMatchObject({
    structured: {
      type: "document",
      blocks: ["Document title", "Document body"],
    },
  });

  const model = await createArtifactPreview(
    metadata({ name: "report.docx", extension: "docx", size: blob.size }),
    blob,
  );

  expect(model).toMatchObject({
    kind: "document",
    status: "ready",
    structured: {
      type: "document",
      blocks: ["Document title", "Document body"],
    },
  });
  expect(model.blob).toBe(blob);
});

test("extracts compatibility text for legacy DOC and PPT files", async () => {
  const document = await parseStructuredPreview({
    kind: "document",
    extension: "doc",
    blob: new Blob(["Legacy Word content"]),
  });
  const presentation = await parseStructuredPreview({
    kind: "presentation",
    extension: "ppt",
    blob: new Blob(["Legacy PowerPoint content"]),
  });

  expect(document).toMatchObject({
    warning: expect.stringMatching(/legacy/i),
    structured: { type: "document", blocks: ["Legacy Word content"] },
  });
  expect(presentation).toMatchObject({
    warning: expect.stringMatching(/legacy/i),
    structured: {
      type: "presentation",
      slides: [{ index: 1, blocks: ["Legacy PowerPoint content"] }],
    },
  });
});

test("routes MIME-only legacy Office files and bounds compatibility reads", async () => {
  const blob = new Blob([
    "Legacy deck content",
    new Uint8Array(LEGACY_TEXT_READ_LIMIT + 1),
  ]);
  const presentation = await createArtifactPreview(
    metadata({
      name: "legacy-upload",
      extension: "",
      mimeType: "application/vnd.ms-powerpoint",
      size: blob.size,
    }),
    blob,
  );

  expect(presentation).toMatchObject({
    kind: "presentation",
    status: "ready",
    structured: {
      type: "presentation",
      slides: [{ index: 1, blocks: ["Legacy deck content"] }],
      truncated: true,
    },
  });
});

test("parses XLS and XLSX sheet tabs with bounded rows", async () => {
  for (const [extension, blob] of [
    ["xls", spreadsheetFixture("biff8")],
    ["xlsx", spreadsheetFixture()],
  ] as const) {
    const result = await parseStructuredPreview({
      kind: "spreadsheet",
      extension,
      blob,
    });

    const spreadsheet = result.structured;
    expect(spreadsheet).toMatchObject({ type: "spreadsheet", truncated: true });
    if (spreadsheet?.type !== "spreadsheet")
      throw new Error("Expected a spreadsheet preview.");
    expect(spreadsheet.sheets[0]).toMatchObject({
      name: "Data",
      truncated: true,
    });
    expect(spreadsheet.sheets[0].rows[0]).toEqual(["row-0", "0"]);
    expect(spreadsheet.sheets[0].rows).toHaveLength(SPREADSHEET_ROW_LIMIT);
  }
});

test("parses PPTX slide XML in numeric order", async () => {
  const result = await parseStructuredPreview({
    kind: "presentation",
    extension: "pptx",
    blob: await pptxFixture(),
  });

  expect(result).toMatchObject({
    structured: {
      type: "presentation",
      slides: [
        { index: 1, blocks: ["First slide"] },
        { index: 2, blocks: ["Second slide"] },
      ],
    },
  });
});

test("rejects Office containers beyond bounded parse budgets", async () => {
  const workbook = new JSZip();
  workbook.file("xl/workbook.xml", "<workbook />");
  workbook.file(
    "xl/oversized.bin",
    new Uint8Array(OFFICE_UNCOMPRESSED_LIMIT + 1),
  );
  const workbookBlob = new Blob([
    await workbook.generateAsync({ type: "uint8array", compression: "STORE" }),
  ]);

  const spreadsheet = await createArtifactPreview(
    metadata({
      name: "oversized.xlsx",
      extension: "xlsx",
      size: workbookBlob.size,
    }),
    workbookBlob,
  );

  const presentation = new JSZip();
  presentation.file(
    "ppt/slides/slide1.xml",
    `<a:t>${"x".repeat(PRESENTATION_SLIDE_XML_LIMIT + 1)}</a:t>`,
  );
  const presentationBlob = new Blob([
    await presentation.generateAsync({
      type: "uint8array",
      compression: "STORE",
    }),
  ]);
  const slides = await createArtifactPreview(
    metadata({
      name: "oversized.pptx",
      extension: "pptx",
      size: presentationBlob.size,
    }),
    presentationBlob,
  );

  expect(spreadsheet).toMatchObject({ status: "unsupported" });
  expect(slides).toMatchObject({ status: "unsupported" });
});

test("reads a bounded ZIP entry tree and text samples", async () => {
  const result = await parseStructuredPreview({
    kind: "zip",
    extension: "zip",
    blob: await zipFixture(),
  });

  const archive = result.structured;
  expect(archive).toMatchObject({ type: "zip", truncated: true });
  if (archive?.type !== "zip") throw new Error("Expected a ZIP preview.");
  expect(archive.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "notes/readme.txt",
        textSample: "sample text",
      }),
      expect.objectContaining({ path: "notes/large.txt", textTruncated: true }),
    ]),
  );
  expect(archive.entries).toHaveLength(ZIP_ENTRY_LIMIT);
});

test("rejects highly inflated archives before extracting entries", async () => {
  const zip = new JSZip();
  zip.file("huge.txt", "x".repeat(2 * 1024 * 1024));
  const blob = new Blob([
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  ]);

  const model = await createArtifactPreview(
    metadata({ name: "inflated.zip", extension: "zip", size: blob.size }),
    blob,
  );

  expect(model).toMatchObject({
    kind: "zip",
    status: "unsupported",
    warning: expect.stringContaining("could not be parsed"),
    hex: expect.any(String),
  });
});

test("rejects forged ZIP size metadata before JSZip extraction", async () => {
  const zip = new JSZip();
  zip.file("payload.txt", "payload".repeat(8_192));
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, 1, true);
      break;
    }
  }

  const model = await createArtifactPreview(
    metadata({ name: "forged.zip", extension: "zip", size: bytes.length }),
    new Blob([bytes]),
  );

  expect(model).toMatchObject({
    kind: "zip",
    status: "unsupported",
    warning: expect.stringContaining("could not be parsed"),
  });
});

test("accepts an EOCD-like signature inside a valid ZIP comment", async () => {
  const zip = new JSZip();
  zip.file("readme.txt", "safe");

  const result = await parseStructuredPreview({
    kind: "zip",
    extension: "zip",
    blob: new Blob([
      await zip.generateAsync({
        type: "uint8array",
        comment: "comment-PK\u0005\u0006-marker",
      }),
    ]),
  });

  expect(result).toMatchObject({
    structured: {
      type: "zip",
      entries: [{ path: "readme.txt", textSample: "safe" }],
    },
  });
});

test("honors an aborted signal before structured parser work starts", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    parseStructuredPreview({
      kind: "zip",
      extension: "zip",
      blob: await zipFixture(),
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test("converts HEIC to a disposable local image URL", async () => {
  const createObjectURL = jest.fn(() => "blob:converted-heic");
  const revokeObjectURL = jest.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  const blob = new Blob(["heic"]);

  const model = await createArtifactPreview(
    metadata({ name: "photo.heic", extension: "heic", size: blob.size }),
    blob,
  );
  disposeArtifactPreview(model);

  expect(mockHeic2any).toHaveBeenCalledWith({
    blob,
    toType: "image/jpeg",
  });
  expect(model).toMatchObject({
    kind: "heic",
    status: "ready",
    url: "blob:converted-heic",
  });
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:converted-heic");
});

test("falls back to bounded binary metadata for malformed structured files", async () => {
  const blob = new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef])]);

  const model = await createArtifactPreview(
    metadata({ name: "broken.docx", extension: "docx", size: blob.size }),
    blob,
  );

  expect(model).toMatchObject({
    kind: "document",
    status: "unsupported",
    hex: "de ad be ef",
    warning: expect.stringContaining("could not be parsed"),
  });
  expect(model.blob).toBe(blob);
});

test("keeps HTML and SVG inputs out of the structured parser", async () => {
  const html = await createArtifactPreview(
    metadata({ name: "unsafe.html", extension: "html", mimeType: "text/html" }),
    new Blob(["<script>window.executed = true</script>"], {
      type: "text/html",
    }),
  );
  const svg = await createArtifactPreview(
    metadata({
      name: "image.svg",
      extension: "svg",
      mimeType: "image/svg+xml",
    }),
    new Blob(["<svg><script>window.executed = true</script></svg>"], {
      type: "image/svg+xml",
    }),
  );

  expect(html).toMatchObject({
    kind: "text",
    content: expect.stringContaining("<script>"),
  });
  expect(svg).toMatchObject({ kind: "image", status: "ready" });
  expect(svg.structured).toBeUndefined();
});
