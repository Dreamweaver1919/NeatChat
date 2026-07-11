export type ArtifactCategory = "document" | "code" | "image" | "other";
export type ArtifactFilter = "all" | ArtifactCategory;
export type ArtifactPreviewKind = "text" | "image" | "pdf" | "unsupported";

export const MAX_ARTIFACT_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_ARTIFACT_LIBRARY_SIZE = 250 * 1024 * 1024;

export interface ArtifactMetadata {
  id: string; fingerprint: string; name: string; mimeType: string;
  extension: string; category: ArtifactCategory; size: number;
  createdAt: number; updatedAt: number; lastModified: number;
  previewText?: string; sessionId?: string;
}

export interface ArtifactRecord extends ArtifactMetadata { blob: Blob }

const CODE_EXTENSIONS = new Set([
  "c", "cc", "cpp", "css", "go", "h", "hpp", "html", "java", "js",
  "jsx", "json", "md", "mjs", "py", "rb", "rs", "scss", "sh", "sql",
  "swift", "toml", "ts", "tsx", "vue", "xml", "yaml", "yml",
]);

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
]);

function extensionOf(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1);
  return name.includes(".") ? extension.toLowerCase() : "";
}

export function classifyArtifact(file: File): ArtifactCategory {
  const extension = extensionOf(file.name);
  const mimeType = file.type.toLowerCase();

  if (CODE_EXTENSIONS.has(extension)) return "code";
  if (mimeType.startsWith("image/")) return "image";
  if (DOCUMENT_MIME_TYPES.has(mimeType) || mimeType.startsWith("text/")) return "document";
  return "other";
}

export function fingerprintArtifact(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function filterArtifacts(
  items: ArtifactMetadata[],
  query: string,
  category: ArtifactFilter,
): ArtifactMetadata[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items
    .filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesQuery = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPreviewKind(item: ArtifactMetadata): ArtifactPreviewKind {
  if (item.category === "image") return "image";
  const mimeType = item.mimeType.toLowerCase();
  if (mimeType === "application/pdf" || item.extension.toLowerCase() === "pdf") {
    return "pdf";
  }
  if (item.category === "code" || mimeType.startsWith("text/")) return "text";
  return "unsupported";
}
