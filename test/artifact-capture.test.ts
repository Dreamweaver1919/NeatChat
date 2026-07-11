import {
  captureArtifacts,
  getArtifactCaptureMessage,
  queueArtifactCapture,
  queueSelectedArtifactCapture,
} from "../app/artifacts/capture";
import { ArtifactLibraryError } from "../app/artifacts/repository";
import { type FileInfo, processSelectedAttachments } from "../app/utils/file";

function toFileInfo(file: File): FileInfo {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    content: file.name,
    originalFile: file,
  };
}

test("records accepted files and reports unique persistence failures without rejecting", async () => {
  const repository = {
    add: jest
      .fn()
      .mockResolvedValueOnce({ id: "ok" })
      .mockRejectedValueOnce(new ArtifactLibraryError("library-full"))
      .mockRejectedValueOnce(new ArtifactLibraryError("library-full"))
      .mockRejectedValueOnce(new Error("storage unavailable")),
  } as any;
  const files = [
    new File(["a"], "a.txt"),
    new File(["b"], "b.txt"),
    new File(["c"], "c.txt"),
    new File(["d"], "d.txt"),
  ];

  await expect(
    captureArtifacts(files, "session-1", repository),
  ).resolves.toEqual({
    saved: 1,
    failures: ["library-full", "write-failed"],
  });
  expect(repository.add).toHaveBeenNthCalledWith(1, files[0], "session-1");
  expect(repository.add).toHaveBeenNthCalledWith(4, files[3], "session-1");
});

test("maps each artifact persistence error to distinct user feedback", () => {
  const messages = {
    unsupported: "unsupported",
    "file-too-large": "too large",
    "library-full": "full",
    "write-failed": "failed",
  };

  expect(getArtifactCaptureMessage("unsupported", messages)).toBe(
    "unsupported",
  );
  expect(getArtifactCaptureMessage("file-too-large", messages)).toBe(
    "too large",
  );
  expect(getArtifactCaptureMessage("library-full", messages)).toBe("full");
  expect(getArtifactCaptureMessage("write-failed", messages)).toBe("failed");
});

test("skips excess picker files before category-specific processing", async () => {
  const processFile = jest.fn(async (file: File) => toFileInfo(file));
  const processImage = jest.fn(async (file: File) => `url:${file.name}`);
  const documentFiles = [
    new File(["a"], "first.txt", { type: "text/plain" }),
    new File(["b"], "second.txt", { type: "text/plain" }),
    new File(["c"], "third.txt", { type: "text/plain" }),
  ];
  const imageFiles = [
    new File(["a"], "first.png", { type: "image/png" }),
    new File(["b"], "second.png", { type: "image/png" }),
    new File(["c"], "third.png", { type: "image/png" }),
  ];

  const result = await processSelectedAttachments(
    [...documentFiles, ...imageFiles],
    {
      remainingFileSlots: 1,
      remainingImageSlots: 2,
      processFile,
      processImage,
    },
  );

  expect(processFile).toHaveBeenCalledTimes(1);
  expect(processFile).toHaveBeenCalledWith(documentFiles[0]);
  expect(processImage).toHaveBeenCalledTimes(2);
  expect(processImage).toHaveBeenNthCalledWith(1, imageFiles[0]);
  expect(processImage).toHaveBeenNthCalledWith(2, imageFiles[1]);
  expect(result.fileInfos).toEqual([toFileInfo(documentFiles[0])]);
  expect(result.imageUrls).toEqual(["url:first.png", "url:second.png"]);
  expect(result.imageFiles[0]).toBe(imageFiles[0]);
  expect(result.imageFiles[1]).toBe(imageFiles[1]);
  expect((result as any).selectedFiles).toHaveLength(1);
  expect((result as any).selectedFiles[0]).toBe(documentFiles[0]);
  expect((result as any).selectedImageFiles).toHaveLength(2);
  expect((result as any).selectedImageFiles[0]).toBe(imageFiles[0]);
  expect((result as any).selectedImageFiles[1]).toBe(imageFiles[1]);
  expect(result.skippedFiles).toBe(2);
  expect(result.skippedImages).toBe(1);
});

test("returns accepted original image files in image URL order", async () => {
  const firstImage = new File(["a"], "first.png", { type: "image/png" });
  const secondImage = new File(["b"], "second.png", {
    type: "image/png",
  });

  const result = await processSelectedAttachments([secondImage, firstImage], {
    remainingFileSlots: 0,
    remainingImageSlots: 2,
    processFile: jest.fn(),
    processImage: async (file) => `url:${file.name}`,
  });

  expect(result.fileInfos).toEqual([]);
  expect(result.imageUrls).toEqual(["url:second.png", "url:first.png"]);
  expect(result.imageFiles[0]).toBe(secondImage);
  expect(result.imageFiles[1]).toBe(firstImage);
  expect((result as any).selectedFiles).toHaveLength(0);
  expect((result as any).selectedImageFiles).toHaveLength(2);
  expect((result as any).selectedImageFiles[0]).toBe(secondImage);
  expect((result as any).selectedImageFiles[1]).toBe(firstImage);
  expect(result.skippedFiles).toBe(0);
  expect(result.skippedImages).toBe(0);
});

test("keeps a cap-approved original when its parser fails", async () => {
  const selectedFile = new File(["bad"], "selected.txt", {
    type: "text/plain",
  });
  const excessFile = new File(["excess"], "excess.txt", {
    type: "text/plain",
  });
  const processFile = jest.fn().mockRejectedValue(new Error("parse failed"));
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  try {
    const result = await processSelectedAttachments(
      [selectedFile, excessFile],
      { remainingFileSlots: 1, processFile },
    );

    expect(processFile).toHaveBeenCalledTimes(1);
    expect(processFile).toHaveBeenCalledWith(selectedFile);
    expect(result.fileInfos).toEqual([]);
    expect(result.selectedFiles).toEqual([selectedFile]);
    expect(result.skippedFiles).toBe(1);
  } finally {
    consoleError.mockRestore();
  }
});

test("queues capped picker originals even when parsing produces no attachments", async () => {
  const selectedFile = new File(["bad"], "selected.txt", {
    type: "text/plain",
  });
  const processFile = jest.fn().mockRejectedValue(new Error("parse failed"));
  const consoleError = jest.spyOn(console, "error").mockImplementation();
  const repository = {
    add: jest.fn().mockResolvedValue({ id: "saved" }),
  } as any;

  try {
    const selection = await processSelectedAttachments([selectedFile], {
      remainingFileSlots: 1,
      processFile,
    });
    queueSelectedArtifactCapture(
      "picker",
      selection,
      "session-1",
      jest.fn(),
      repository,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(repository.add).toHaveBeenCalledWith(selectedFile, "session-1");
  } finally {
    consoleError.mockRestore();
  }
});

test("does not queue generated long-text attachments for artifact capture", async () => {
  const repository = { add: jest.fn() } as any;
  const onFailure = jest.fn();

  queueArtifactCapture(
    "generated-long-text",
    [new File(["long text"], "generated.txt", { type: "text/plain" })],
    "session-1",
    onFailure,
    repository,
  );
  await Promise.resolve();

  expect(repository.add).not.toHaveBeenCalled();
  expect(onFailure).not.toHaveBeenCalled();
});
