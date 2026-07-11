import { createStore, del, get, set } from "idb-keyval";
import {
  classifyArtifact,
  fingerprintArtifact,
  MAX_ARTIFACT_FILE_SIZE,
  MAX_ARTIFACT_LIBRARY_SIZE,
  type ArtifactMetadata,
  type ArtifactRecord,
} from "./library";

const INDEX_KEY = "artifacts";
const PREVIEW_TEXT_LIMIT = 2 * 1024;

export const ARTIFACT_LIBRARY_CHANGED = "artifact-library-changed";

export interface ArtifactStorage {
  readIndex(): Promise<ArtifactMetadata[]>;
  writeIndex(items: ArtifactMetadata[]): Promise<void>;
  readBlob(id: string): Promise<Blob | undefined>;
  writeBlob(id: string, blob: Blob): Promise<void>;
  deleteBlob(id: string): Promise<void>;
}

export class ArtifactLibraryError extends Error {
  public readonly cleanupFailed: boolean;

  constructor(
    public code:
      | "unsupported"
      | "file-too-large"
      | "library-full"
      | "write-failed",
    options: { cause?: unknown; cleanupFailed?: boolean } = {},
  ) {
    super(code);
    this.name = "ArtifactLibraryError";
    this.cause = options.cause;
    this.cleanupFailed = options.cleanupFailed ?? false;
  }
}

export class IndexedDbArtifactStorage implements ArtifactStorage {
  private indexStore?: ReturnType<typeof createStore>;
  private blobStore?: ReturnType<typeof createStore>;

  private ensureSupported(): void {
    if (typeof indexedDB === "undefined") {
      throw new ArtifactLibraryError("unsupported");
    }
  }

  async readIndex(): Promise<ArtifactMetadata[]> {
    const items = await get<ArtifactMetadata[]>(
      INDEX_KEY,
      this.getIndexStore(),
    );
    return Array.isArray(items) ? items : [];
  }

  async writeIndex(items: ArtifactMetadata[]): Promise<void> {
    await set(INDEX_KEY, items, this.getIndexStore());
  }

  async readBlob(id: string): Promise<Blob | undefined> {
    return get<Blob>(id, this.getBlobStore());
  }

  async writeBlob(id: string, blob: Blob): Promise<void> {
    await set(id, blob, this.getBlobStore());
  }

  async deleteBlob(id: string): Promise<void> {
    await del(id, this.getBlobStore());
  }

  private getIndexStore(): ReturnType<typeof createStore> {
    this.ensureSupported();
    this.indexStore ??= createStore(
      "neatchat-artifact-library-index",
      "metadata",
    );
    return this.indexStore;
  }

  private getBlobStore(): ReturnType<typeof createStore> {
    this.ensureSupported();
    this.blobStore ??= createStore("neatchat-artifact-library-blobs", "blobs");
    return this.blobStore;
  }
}

export interface ArtifactRepositoryOptions {
  maxFileSize?: number;
  maxTotalSize?: number;
  now?: () => number;
}

export class ArtifactRepository {
  private readonly maxFileSize: number;
  private readonly maxTotalSize: number;
  private readonly now: () => number;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: ArtifactStorage,
    options: ArtifactRepositoryOptions = {},
  ) {
    this.maxFileSize = options.maxFileSize ?? MAX_ARTIFACT_FILE_SIZE;
    this.maxTotalSize = options.maxTotalSize ?? MAX_ARTIFACT_LIBRARY_SIZE;
    this.now = options.now ?? Date.now;
  }

  async list(): Promise<ArtifactMetadata[]> {
    try {
      return [...(await this.storage.readIndex())];
    } catch (error) {
      throw this.asLibraryError(error);
    }
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    try {
      return await this.storage.readBlob(id);
    } catch (error) {
      throw this.asLibraryError(error);
    }
  }

  async get(id: string): Promise<ArtifactRecord | undefined> {
    const metadata = (await this.list()).find((item) => item.id === id);
    if (!metadata) return undefined;

    const blob = await this.getBlob(id);
    return blob ? { ...metadata, blob } : undefined;
  }

  async add(file: File, sessionId?: string): Promise<ArtifactMetadata> {
    return this.enqueueMutation(() => this.addArtifact(file, sessionId));
  }

  async remove(id: string): Promise<void> {
    return this.enqueueMutation(() => this.removeArtifact(id));
  }

  private async addArtifact(
    file: File,
    sessionId?: string,
  ): Promise<ArtifactMetadata> {
    if (file.size > this.maxFileSize) {
      throw new ArtifactLibraryError("file-too-large");
    }

    let index: ArtifactMetadata[];
    try {
      index = await this.storage.readIndex();
    } catch (error) {
      throw this.asLibraryError(error);
    }

    const fingerprint = fingerprintArtifact(file);
    const existing = index.find((item) => item.fingerprint === fingerprint);
    if (existing) {
      const updated: ArtifactMetadata = {
        ...existing,
        updatedAt: this.now(),
        ...(sessionId === undefined ? {} : { sessionId }),
      };

      try {
        await this.storage.writeIndex(
          index.map((item) => (item.id === existing.id ? updated : item)),
        );
      } catch (error) {
        throw this.asLibraryError(error);
      }

      this.notifyChanged();
      return updated;
    }

    const totalSize = index.reduce((total, item) => total + item.size, 0);
    if (totalSize + file.size > this.maxTotalSize) {
      throw new ArtifactLibraryError("library-full");
    }

    const timestamp = this.now();
    const metadata: ArtifactMetadata = {
      id: this.createId(),
      fingerprint,
      name: file.name,
      mimeType: file.type,
      extension: this.extensionOf(file.name),
      category: classifyArtifact(file),
      size: file.size,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastModified: file.lastModified,
      previewText: await this.previewText(file),
      ...(sessionId === undefined ? {} : { sessionId }),
    };

    try {
      await this.storage.writeBlob(metadata.id, file);
    } catch (error) {
      throw this.asLibraryError(error);
    }

    try {
      await this.storage.writeIndex([metadata, ...index]);
    } catch (error) {
      try {
        await this.storage.deleteBlob(metadata.id);
      } catch (cleanupError) {
        throw new ArtifactLibraryError("write-failed", {
          cause: cleanupError,
          cleanupFailed: true,
        });
      }
      throw this.asLibraryError(error);
    }

    this.notifyChanged();
    return metadata;
  }

  private async removeArtifact(id: string): Promise<void> {
    let index: ArtifactMetadata[];
    try {
      index = await this.storage.readIndex();
    } catch (error) {
      throw this.asLibraryError(error);
    }

    const nextIndex = index.filter((item) => item.id !== id);
    if (nextIndex.length === index.length) return;

    try {
      await this.storage.deleteBlob(id);
      await this.storage.writeIndex(nextIndex);
    } catch (error) {
      throw this.asLibraryError(error);
    }

    this.notifyChanged();
  }

  private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(mutation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async previewText(file: File): Promise<string | undefined> {
    const isText =
      file.type.startsWith("text/") || classifyArtifact(file) === "code";
    if (!isText) return undefined;

    try {
      const preview = file.slice(0, PREVIEW_TEXT_LIMIT);
      if (typeof preview.text === "function") return await preview.text();
      if (typeof FileReader === "undefined") return undefined;

      return await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(
            typeof reader.result === "string" ? reader.result : undefined,
          );
        reader.onerror = () => resolve(undefined);
        reader.readAsText(preview);
      });
    } catch {
      return undefined;
    }
  }

  private extensionOf(name: string): string {
    const lastDot = name.lastIndexOf(".");
    return lastDot === -1 ? "" : name.slice(lastDot + 1).toLowerCase();
  }

  private createId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `${this.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private asLibraryError(error: unknown): ArtifactLibraryError {
    return error instanceof ArtifactLibraryError
      ? error
      : new ArtifactLibraryError("write-failed", { cause: error });
  }

  private notifyChanged(): void {
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new Event(ARTIFACT_LIBRARY_CHANGED));
    }
  }
}

export const artifactRepository = new ArtifactRepository(
  new IndexedDbArtifactStorage(),
);
