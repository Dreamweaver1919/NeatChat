import {
  classifyArtifact,
  filterArtifacts,
  fingerprintArtifact,
  getPreviewKind,
  type ArtifactMetadata,
} from "../app/artifacts/library";

const item = (override: Partial<ArtifactMetadata>): ArtifactMetadata => ({
  id: "1", fingerprint: "a", name: "notes.txt", mimeType: "text/plain",
  extension: "txt", category: "document", size: 10, createdAt: 1,
  updatedAt: 1, lastModified: 1, previewText: "hello", ...override,
});

test("classifies code before generic text", () => {
  expect(classifyArtifact(new File(["x"], "index.ts", { type: "text/plain" }))).toBe("code");
});
test("filters by query/category and sorts retained results newest first", () => {
  const result = filterArtifacts([
    item({ id: "old", name: "notes.pdf", updatedAt: 1 }),
    item({ id: "middle", name: "brief.txt", updatedAt: 2 }),
    item({ id: "new", name: "client.ts", category: "code", updatedAt: 2 }),
  ], "", "all");
  expect(result.map((x) => x.id)).toEqual(["middle", "new", "old"]);
});

test("filters case-insensitive queries within the selected category", () => {
  const result = filterArtifacts([
    item({ id: "code", name: "client.ts", category: "code" }),
    item({ id: "document", name: "client.txt", category: "document" }),
  ], "CLIENT", "code");
  expect(result.map((x) => x.id)).toEqual(["code"]);
});

test("classifies images and MIME-aware documents", () => {
  expect(classifyArtifact(new File(["x"], "photo.bin", { type: "image/png" }))).toBe("image");
  expect(classifyArtifact(new File(["x"], "report.bin", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }))).toBe("document");
});

test("uses stable metadata fingerprint and safe preview kind", () => {
  const file = new File(["x"], "index.ts", { type: "text/plain", lastModified: 7 });
  expect(fingerprintArtifact(file)).toBe("index.ts:1:7");
  expect(getPreviewKind(item({ category: "code" }))).toBe("text");
});

test("does not expose binary office documents as text previews", () => {
  expect(getPreviewKind(item({
    name: "report.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    category: "document",
  }))).toBe("unsupported");
});
