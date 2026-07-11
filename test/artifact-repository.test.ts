import {
  ArtifactLibraryError,
  ArtifactRepository,
  type ArtifactStorage,
} from "../app/artifacts/repository";
import type { ArtifactMetadata } from "../app/artifacts/library";

class MemoryArtifactStorage implements ArtifactStorage {
  public blobReads = 0;
  public blobWrites = 0;
  public failIndexWrites = false;
  public failBlobDeletes = false;
  private index: ArtifactMetadata[] = [];
  private blobs = new Map<string, Blob>();

  get blobCount(): number {
    return this.blobs.size;
  }

  async readIndex(): Promise<ArtifactMetadata[]> {
    return this.index;
  }

  async writeIndex(items: ArtifactMetadata[]): Promise<void> {
    if (this.failIndexWrites) throw new Error("index unavailable");
    this.index = items;
  }

  async readBlob(id: string): Promise<Blob | undefined> {
    this.blobReads += 1;
    return this.blobs.get(id);
  }

  async writeBlob(id: string, blob: Blob): Promise<void> {
    this.blobWrites += 1;
    this.blobs.set(id, blob);
  }

  async deleteBlob(id: string): Promise<void> {
    if (this.failBlobDeletes) throw new Error("blob unavailable");
    this.blobs.delete(id);
  }
}

class ConcurrentMemoryArtifactStorage extends MemoryArtifactStorage {
  async readIndex(): Promise<ArtifactMetadata[]> {
    const index = await super.readIndex();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return index;
  }
}

test("stores metadata separately and reads the blob lazily", async () => {
  const storage = new MemoryArtifactStorage();
  const repo = new ArtifactRepository(storage);
  const saved = await repo.add(
    new File(["hello"], "notes.txt", {
      type: "text/plain",
      lastModified: 1,
    }),
  );

  expect(await repo.list()).toEqual([
    expect.objectContaining({
      id: saved.id,
      name: "notes.txt",
      previewText: "hello",
    }),
  ]);
  expect(storage.blobReads).toBe(0);
  expect(await repo.getBlob(saved.id)).toBeInstanceOf(Blob);
  expect(storage.blobReads).toBe(1);
});

test("deduplicates by fingerprint and refreshes the linked session", async () => {
  const storage = new MemoryArtifactStorage();
  let now = 10;
  const repo = new ArtifactRepository(storage, { now: () => now });
  const file = new File(["x"], "same.ts", {
    type: "text/plain",
    lastModified: 2,
  });

  const first = await repo.add(file, "session-a");
  now = 20;
  const second = await repo.add(file, "session-b");

  expect(second).toEqual(
    expect.objectContaining({
      id: first.id,
      createdAt: 10,
      updatedAt: 20,
      sessionId: "session-b",
    }),
  );
  expect(await repo.list()).toEqual([second]);
  expect(storage.blobWrites).toBe(1);
});

test("maps file and total capacity violations", async () => {
  const fileLimitRepo = new ArtifactRepository(new MemoryArtifactStorage(), {
    maxFileSize: 1,
    maxTotalSize: 2,
  });
  await expect(
    fileLimitRepo.add(new File(["xx"], "large.txt")),
  ).rejects.toMatchObject({ code: "file-too-large" });

  const totalLimitRepo = new ArtifactRepository(new MemoryArtifactStorage(), {
    maxFileSize: 2,
    maxTotalSize: 2,
  });
  await totalLimitRepo.add(new File(["xx"], "first.txt"));
  await expect(
    totalLimitRepo.add(new File(["x"], "second.txt")),
  ).rejects.toMatchObject({ code: "library-full" });
});

test("rolls back a blob when persisting its metadata fails", async () => {
  const storage = new MemoryArtifactStorage();
  storage.failIndexWrites = true;
  const repo = new ArtifactRepository(storage);

  await expect(repo.add(new File(["x"], "notes.txt"))).rejects.toBeInstanceOf(
    ArtifactLibraryError,
  );
  expect(storage.blobWrites).toBe(1);
  expect(storage.blobCount).toBe(0);
});

test("keeps metadata when blob deletion fails so removal can be retried", async () => {
  const storage = new MemoryArtifactStorage();
  const repo = new ArtifactRepository(storage);
  const saved = await repo.add(new File(["x"], "notes.txt"));
  storage.failBlobDeletes = true;

  await expect(repo.remove(saved.id)).rejects.toMatchObject({
    code: "write-failed",
  });
  expect(await repo.list()).toEqual([saved]);
  expect(await repo.getBlob(saved.id)).toBeInstanceOf(Blob);

  storage.failBlobDeletes = false;
  await repo.remove(saved.id);
  expect(await repo.list()).toEqual([]);
});

test("reports rollback cleanup failures after metadata persistence fails", async () => {
  const storage = new MemoryArtifactStorage();
  storage.failIndexWrites = true;
  storage.failBlobDeletes = true;
  const repo = new ArtifactRepository(storage);

  await expect(repo.add(new File(["x"], "notes.txt"))).rejects.toMatchObject({
    code: "write-failed",
    cleanupFailed: true,
  });
  expect(storage.blobCount).toBe(1);
});

test("serializes concurrent adds so both records and blobs are retained", async () => {
  const storage = new ConcurrentMemoryArtifactStorage();
  const repo = new ArtifactRepository(storage);

  const first = repo.add(new File(["first"], "first.txt"));
  const second = repo.add(new File(["second"], "second.txt"));
  const [firstSaved, secondSaved] = await Promise.all([first, second]);

  expect(await repo.list()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: firstSaved.id, name: "first.txt" }),
      expect.objectContaining({ id: secondSaved.id, name: "second.txt" }),
    ]),
  );
  expect(await repo.getBlob(firstSaved.id)).toBeInstanceOf(Blob);
  expect(await repo.getBlob(secondSaved.id)).toBeInstanceOf(Blob);
});
