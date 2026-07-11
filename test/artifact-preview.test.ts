import {
  createArtifactPreview,
  detectPreviewType,
  disposeArtifactPreview,
  TEXT_PREVIEW_LIMIT,
  type ArtifactPreviewModel,
} from "../app/artifacts/preview";
import type { ArtifactMetadata } from "../app/artifacts/library";

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

test("detects preview types from MIME, extension, and a bounded signature", async () => {
  await expect(
    detectPreviewType(
      metadata({ name: "data", mimeType: "application/json" }),
      new Blob(["{}"]),
    ),
  ).resolves.toBe("text");
  await expect(
    detectPreviewType(
      metadata({ name: "photo.jpeg", extension: "jpeg" }),
      new Blob(["x"]),
    ),
  ).resolves.toBe("image");
  await expect(
    detectPreviewType(
      metadata(),
      new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]),
    ),
  ).resolves.toBe("pdf");
  await expect(
    detectPreviewType(
      metadata(),
      new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]),
    ),
  ).resolves.toBe("zip");
});

test("distinguishes AVIF and common media signatures without MIME hints", async () => {
  const ascii = (value: string) =>
    new Uint8Array(Array.from(value, (character) => character.charCodeAt(0)));
  const signature = (brand: string) =>
    new Blob([new Uint8Array([0, 0, 0, 0]), ascii(`ftyp${brand}`)]);

  await expect(detectPreviewType(metadata(), signature("avif"))).resolves.toBe(
    "image",
  );
  for (const brand of ["heic", "mif1", "heim", "heis", "hevm", "hevs"]) {
    await expect(detectPreviewType(metadata(), signature(brand))).resolves.toBe(
      "heic",
    );
  }

  const wav = new Blob([ascii("RIFF0000WAVEfmt ")]);
  const wavModel = await createArtifactPreview(metadata(), wav);
  expect(wavModel).toMatchObject({ kind: "media", mediaType: "audio" });

  const mp4Model = await createArtifactPreview(metadata(), signature("isom"));
  expect(mp4Model).toMatchObject({ kind: "media", mediaType: "video" });
});

test("reads text previews only through the configured cap", async () => {
  const content = "a".repeat(TEXT_PREVIEW_LIMIT + 10);
  const blob = new Blob([content], { type: "text/plain" });

  const model = await createArtifactPreview(
    metadata({
      name: "large.txt",
      extension: "txt",
      mimeType: "text/plain",
      size: blob.size,
    }),
    blob,
  );

  expect(model).toMatchObject({
    kind: "text",
    content: "a".repeat(TEXT_PREVIEW_LIMIT),
    truncated: true,
  });
  expect(model.blob).toBe(blob);
});

test("returns a bounded hexadecimal fallback for unknown binary files", async () => {
  const blob = new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00])]);

  const model = await createArtifactPreview(
    metadata({ size: blob.size }),
    blob,
  );

  expect(model).toMatchObject({
    kind: "binary",
    hex: "de ad be ef 00",
    updatedAt: 1,
  });
  expect(model.blob).toBe(blob);
});

test("removes FileReader abort listeners after fallback reads settle", async () => {
  const originalFileReader = global.FileReader;
  const controller = new AbortController();
  const removeListener = jest.spyOn(controller.signal, "removeEventListener");

  class FakeFileReader {
    result: string | ArrayBuffer | null = null;
    error: DOMException | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;

    readAsArrayBuffer() {
      this.result = new Uint8Array([117, 110, 107, 110, 111, 119, 110]).buffer;
      this.onload?.({} as ProgressEvent<FileReader>);
    }

    readAsText() {
      this.result = "unknown";
      this.onload?.({} as ProgressEvent<FileReader>);
    }

    abort() {
      this.onabort?.({} as ProgressEvent<FileReader>);
    }
  }

  Object.defineProperty(global, "FileReader", {
    configurable: true,
    value: FakeFileReader,
  });

  try {
    const fallbackBlob = {
      size: 7,
      type: "application/octet-stream",
      slice: () => ({ size: 7, type: "application/octet-stream" }),
    } as unknown as Blob;

    await detectPreviewType(metadata(), fallbackBlob, controller.signal);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  } finally {
    Object.defineProperty(global, "FileReader", {
      configurable: true,
      value: originalFileReader,
    });
  }
});

test("exposes Office and ZIP dispatch types without parsing their contents", async () => {
  const blob = new Blob(["PK"], { type: "application/octet-stream" });

  await expect(
    createArtifactPreview(
      metadata({
        name: "report.xlsx",
        extension: "xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      blob,
    ),
  ).resolves.toMatchObject({ kind: "spreadsheet", status: "unsupported" });
  await expect(
    createArtifactPreview(
      metadata({ name: "archive.zip", extension: "zip" }),
      blob,
    ),
  ).resolves.toMatchObject({ kind: "zip", status: "unsupported" });
});

test("aborts a stale text request after its lazy read resolves", async () => {
  let resolveText: (value: string) => void = () => undefined;
  const text = new Promise<string>((resolve) => {
    resolveText = resolve;
  });
  const blob = {
    size: 10,
    type: "text/plain",
    slice: jest.fn(() => ({ text: () => text })),
  } as unknown as Blob;
  const controller = new AbortController();
  const preview = createArtifactPreview(
    metadata({ name: "notes.txt", extension: "txt", mimeType: "text/plain" }),
    blob,
    controller.signal,
  );

  controller.abort();
  resolveText("stale text");

  await expect(preview).rejects.toMatchObject({ name: "AbortError" });
});

test("releases object URLs created for renderable previews", async () => {
  const createObjectURL = jest.fn(() => "blob:preview");
  const revokeObjectURL = jest.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  const blob = new Blob(["image"], { type: "image/png" });

  const model = await createArtifactPreview(
    metadata({ name: "image.png", extension: "png", mimeType: "image/png" }),
    blob,
  );
  disposeArtifactPreview(model);
  disposeArtifactPreview(model);

  expect(model).toMatchObject({ kind: "image", url: "blob:preview" });
  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

test("does not create resources for non-renderable previews", () => {
  const model = { kind: "binary" } as ArtifactPreviewModel;

  expect(() => disposeArtifactPreview(model)).not.toThrow();
});
