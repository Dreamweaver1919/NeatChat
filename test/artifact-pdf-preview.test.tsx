import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ArtifactPdfPreview } from "../app/components/artifact-pdf-preview";

const mockGetDocument = jest.fn();
const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL",
);
const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL",
);

jest.mock("pdfjs-dist/webpack.mjs", () => ({
  getDocument: mockGetDocument,
}));

const canvasContext = {
  setTransform: jest.fn(),
  clearRect: jest.fn(),
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(canvasContext);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  mockGetDocument.mockReset();
  restoreUrlProperty("createObjectURL", createObjectUrlDescriptor);
  restoreUrlProperty("revokeObjectURL", revokeObjectUrlDescriptor);
});

function restoreUrlProperty(
  property: "createObjectURL" | "revokeObjectURL",
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) Object.defineProperty(URL, property, descriptor);
  else Reflect.deleteProperty(URL, property);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function page(renderPromise = Promise.resolve()) {
  const render = jest.fn(() => ({
    promise: renderPromise,
    cancel: jest.fn(),
  }));
  return {
    getViewport: jest.fn(({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 300 * scale,
    })),
    render,
  };
}

function documentWithPages(pages: ReturnType<typeof page>[]) {
  return {
    numPages: pages.length,
    getPage: jest.fn((pageNumber: number) =>
      Promise.resolve(pages[pageNumber - 1]),
    ),
    destroy: jest.fn(),
  };
}

function load(document: ReturnType<typeof documentWithPages>) {
  const task = {
    promise: Promise.resolve(document),
    destroy: jest.fn(),
  };
  mockGetDocument.mockReturnValue(task);
  return task;
}

function preview(content = "%PDF-1.7", fileName = "brief.pdf") {
  const blob = new Blob([content]);
  Object.defineProperty(blob, "arrayBuffer", {
    value: () => Promise.resolve(new ArrayBuffer(8)),
  });
  return (
    <ArtifactPdfPreview
      blob={blob}
      fileName={fileName}
      url="blob:pdf-preview"
    />
  );
}

test("shows a stable skeleton while PDF.js is loading", () => {
  const loading = deferred<ReturnType<typeof documentWithPages>>();
  mockGetDocument.mockReturnValue({
    promise: loading.promise,
    destroy: jest.fn(),
  });

  render(preview());

  expect(screen.getByTestId("artifact-pdf-skeleton")).toBeVisible();
  expect(screen.getByText("Loading PDF preview...")).toBeVisible();
});

test("falls back when PDF document loading never settles", async () => {
  jest.useFakeTimers();
  const loading = deferred<ReturnType<typeof documentWithPages>>();
  mockGetDocument.mockReturnValue({
    promise: loading.promise,
    destroy: jest.fn(),
  });

  render(preview());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByTestId("artifact-pdf-skeleton")).toBeVisible();
  await act(async () => jest.advanceTimersByTimeAsync(2_000));
  expect(screen.getByTestId("artifact-pdf-native-preview")).toBeVisible();
});

test("renders the first PDF page to a canvas with the local worker entry", async () => {
  const firstPage = page();
  load(documentWithPages([firstPage]));

  render(preview());

  const canvas = await screen.findByRole("img", { name: "Page 1 of 1" });
  expect(canvas).toHaveAttribute("width", "200");
  expect(canvas).toHaveAttribute("height", "300");
  expect(firstPage.render).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasContext,
      viewport: { width: 200, height: 300 },
    }),
  );
  expect(mockGetDocument).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.any(Uint8Array) }),
  );
});

test("fits the default PDF canvas without changing render scale", async () => {
  const firstPage = page();
  load(documentWithPages([firstPage]));

  render(preview());

  const canvas = await screen.findByRole("img", { name: "Page 1 of 1" });
  expect(canvas.className).toContain("fit-width");
  expect(firstPage.getViewport).toHaveBeenLastCalledWith({ scale: 1 });
});

test("keeps the skeleton visible until the first page has painted", async () => {
  const painting = deferred<void>();
  load(documentWithPages([page(painting.promise)]));

  render(preview());

  await screen.findByRole("toolbar", { name: "PDF controls" });
  expect(screen.getByTestId("artifact-pdf-skeleton")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  painting.resolve();
  expect(await screen.findByRole("img", { name: "Page 1 of 1" })).toBeVisible();
});

test("falls back to the local native PDF viewer when Canvas stalls", async () => {
  jest.useFakeTimers();
  const painting = deferred<void>();
  load(documentWithPages([page(painting.promise)]));

  render(preview());
  await screen.findByRole("toolbar", { name: "PDF controls" });
  await act(async () => jest.advanceTimersByTimeAsync(800));

  expect(screen.getByTestId("artifact-pdf-native-preview")).toHaveAttribute(
    "data",
    "blob:pdf-preview",
  );
});

test("keeps the native fallback when the late Canvas render rejects", async () => {
  jest.useFakeTimers();
  const painting = deferred<void>();
  load(documentWithPages([page(painting.promise)]));

  render(preview());
  await screen.findByRole("toolbar", { name: "PDF controls" });
  await act(async () => jest.advanceTimersByTimeAsync(800));
  expect(screen.getByTestId("artifact-pdf-native-preview")).toBeVisible();

  await act(async () => painting.reject(new Error("late render failure")));
  expect(screen.getByTestId("artifact-pdf-native-preview")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("changes pages and zoom using 44 px controls", async () => {
  const firstPage = page();
  const secondPage = page();
  const document = documentWithPages([firstPage, secondPage]);
  load(document);

  render(preview());

  await screen.findByRole("img", { name: "Page 1 of 2" });
  expect(screen.getByText("1 / 2")).toBeVisible();

  const next = screen.getByRole("button", { name: "Next page" });
  expect(next).toHaveStyle({ minHeight: "44px", minWidth: "44px" });
  fireEvent.click(next);
  await screen.findByRole("img", { name: "Page 2 of 2" });

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() =>
    expect(secondPage.getViewport).toHaveBeenLastCalledWith({ scale: 1.25 }),
  );
  expect(screen.getByText("125%")).toBeVisible();
});

test("cancels an outdated page render before rendering the next page", async () => {
  const firstRender = deferred<void>();
  const firstPage = page(firstRender.promise);
  const secondPage = page();
  load(documentWithPages([firstPage, secondPage]));

  render(preview());

  await screen.findByRole("button", { name: "Next page" });
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  expect(firstPage.render.mock.results[0].value.cancel).toHaveBeenCalled();
  await screen.findByRole("img", { name: "Page 2 of 2" });
});

test("waits for worker teardown before loading a replacement PDF", async () => {
  const destroy = deferred<void>();
  const firstDocument = documentWithPages([page()]);
  const secondDocument = documentWithPages([page()]);
  mockGetDocument
    .mockReturnValueOnce({
      promise: Promise.resolve(firstDocument),
      destroy: jest.fn(() => destroy.promise),
    })
    .mockReturnValueOnce({
      promise: Promise.resolve(secondDocument),
      destroy: jest.fn(),
    });

  const { rerender } = render(preview("first", "first.pdf"));
  await screen.findByRole("img", { name: "Page 1 of 1" });
  rerender(preview("second", "second.pdf"));

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(mockGetDocument).toHaveBeenCalledTimes(1);
  destroy.resolve();
  await waitFor(() => expect(mockGetDocument).toHaveBeenCalledTimes(2));
});

test("continues replacement loading when teardown rejects", async () => {
  const firstDocument = documentWithPages([page()]);
  const secondDocument = documentWithPages([page()]);
  const firstTask = {
    promise: Promise.resolve(firstDocument),
    destroy: jest.fn(() => Promise.reject(new Error("teardown failed"))),
  };
  mockGetDocument.mockReturnValueOnce(firstTask).mockReturnValueOnce({
    promise: Promise.resolve(secondDocument),
    destroy: jest.fn(),
  });

  const { rerender } = render(preview("first", "first.pdf"));
  await screen.findByRole("img", { name: "Page 1 of 1" });
  rerender(preview("second", "second.pdf"));

  await waitFor(() => expect(firstTask.destroy).toHaveBeenCalled());
  await waitFor(() => expect(firstDocument.destroy).toHaveBeenCalled());
  await waitFor(() => expect(mockGetDocument).toHaveBeenCalledTimes(2));
});

test("shows a download fallback when PDF loading fails", async () => {
  mockGetDocument.mockReturnValue({
    promise: Promise.reject(new Error("Password protected")),
    destroy: jest.fn(),
  });

  render(preview());

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "PDF preview is unavailable. Download the original file to open it.",
  );
  expect(
    screen.getByRole("button", { name: "Download original PDF" }),
  ).toBeVisible();
});

test("defers fallback download URL cleanup for Safari", async () => {
  jest.useFakeTimers();
  const createObjectURL = jest.fn(() => "blob:download");
  const revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  mockGetDocument.mockReturnValue({
    promise: Promise.reject(new Error("broken")),
    destroy: jest.fn(),
  });

  render(preview());
  fireEvent.click(
    await screen.findByRole("button", { name: "Download original PDF" }),
  );
  expect(createObjectURL).toHaveBeenCalled();
  expect(revokeObjectURL).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1_000);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
});

test("cancels PDF work and destroys the document on teardown", async () => {
  const renderDeferred = deferred<void>();
  const firstPage = page(renderDeferred.promise);
  const document = documentWithPages([firstPage]);
  const task = load(document);

  const { unmount } = render(preview());
  await waitFor(() => expect(firstPage.render).toHaveBeenCalled());
  unmount();

  expect(firstPage.render.mock.results[0].value.cancel).toHaveBeenCalled();
  await waitFor(() => expect(task.destroy).toHaveBeenCalled());
  await waitFor(() => expect(document.destroy).toHaveBeenCalled());
});

test("destroys a document that resolves after teardown", async () => {
  const loading = deferred<ReturnType<typeof documentWithPages>>();
  const task = { promise: loading.promise, destroy: jest.fn() };
  mockGetDocument.mockReturnValue(task);
  const document = documentWithPages([page()]);

  const { unmount } = render(preview());
  await waitFor(() => expect(mockGetDocument).toHaveBeenCalled());
  unmount();
  loading.resolve(document);

  await waitFor(() => expect(document.destroy).toHaveBeenCalled());
  expect(task.destroy).toHaveBeenCalled();
});
