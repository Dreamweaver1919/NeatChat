import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ArtifactLibraryPage } from "../app/components/artifact-library";
import type { ArtifactMetadata } from "../app/artifacts/library";

jest.mock("../app/icons/file.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/image.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/download.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/delete.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/close.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/return.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/three-dots.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/eye.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/eye-off.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/down.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/confirm.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/cancel.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/max.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/icons/min.svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../app/components/artifact-pdf-preview", () => ({
  ArtifactPdfPreview: ({ fileName }: { fileName: string }) => (
    <div data-testid="pdf-canvas-preview">{fileName}</div>
  ),
}));

const createObjectURL = jest.fn(() => "blob:preview");
const revokeObjectURL = jest.fn();
Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  value: createObjectURL,
});
Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  value: revokeObjectURL,
});

afterEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

function artifact(override: Partial<ArtifactMetadata>): ArtifactMetadata {
  return {
    id: "artifact-1",
    fingerprint: "artifact",
    name: "notes.txt",
    mimeType: "text/plain",
    extension: "txt",
    category: "document",
    size: 12,
    createdAt: 1,
    updatedAt: 1,
    lastModified: 1,
    previewText: "saved text",
    ...override,
  };
}

function repositoryWith(items: ArtifactMetadata[]) {
  let records = [...items];

  return {
    list: jest.fn(async () => records),
    getBlob: jest.fn(
      async (_id?: string): Promise<Blob | undefined> =>
        new Blob(["const safe = true;"]),
    ),
    remove: jest.fn(async (id: string) => {
      records = records.filter((item) => item.id !== id);
    }),
  };
}

test("renders an empty library", async () => {
  const repository = repositoryWith([]);

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  expect(await screen.findByText("No saved artifacts yet.")).toBeVisible();
  expect(screen.getByText("0 artifacts")).toBeVisible();
  expect(screen.getByRole("button", { name: "Return to chat" })).toBeVisible();
  expect(repository.getBlob).not.toHaveBeenCalled();
});

test("filters metadata by category and retrieves a blob only when previewing", async () => {
  const repository = repositoryWith([
    artifact({
      id: "code-1",
      name: "client.ts",
      category: "code",
      extension: "ts",
      previewText: "const client = true;",
    }),
    artifact({
      id: "pdf-1",
      name: "brief.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
    }),
  ]);

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  expect(await screen.findByText("client.ts")).toBeVisible();
  expect(screen.getByText("const client = true;")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Code" }));

  expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
  expect(repository.getBlob).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Open client.ts" }));

  await waitFor(() => {
    expect(repository.getBlob).toHaveBeenCalledWith("code-1");
  });
  const dialog = screen.getByRole("dialog", { name: "client.ts" });
  expect(dialog).toBeVisible();
  expect(await within(dialog).findByText("const safe = true;")).toBeVisible();
});

test("loads image blobs for thumbnails and returns focus after preview", async () => {
  const repository = repositoryWith([
    artifact({
      id: "image-1",
      name: "preview.png",
      mimeType: "image/png",
      extension: "png",
      category: "image",
    }),
  ]);
  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  const openButton = await screen.findByRole("button", {
    name: "Open preview.png",
  });
  await waitFor(() =>
    expect(repository.getBlob).toHaveBeenCalledWith("image-1"),
  );
  expect(
    screen.getByRole("img", { name: "preview.png thumbnail" }),
  ).toBeVisible();

  fireEvent.click(openButton);
  expect(
    await screen.findByRole("dialog", { name: "preview.png" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  expect(openButton).toHaveFocus();
});

test("shows preview feedback immediately while the original blob loads", async () => {
  const repository = repositoryWith([
    artifact({ id: "slow-1", name: "slow.txt" }),
  ]);
  repository.getBlob.mockImplementation(() => new Promise(() => undefined));

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Open slow.txt" }));
  const dialog = screen.getByRole("dialog", { name: "slow.txt" });
  expect(within(dialog).getByText("Loading preview...")).toBeVisible();
  expect(within(dialog).getByLabelText("Loading preview...")).toHaveAttribute(
    "aria-busy",
    "true",
  );
});

test("suppresses a stale preview when files are opened rapidly", async () => {
  const resolvers = new Map<string, (blob: Blob) => void>();
  const repository = repositoryWith([
    artifact({ id: "first", name: "first.txt" }),
    artifact({ id: "second", name: "second.txt" }),
  ]);
  repository.getBlob.mockImplementation(
    (id?: string) =>
      new Promise<Blob>((resolve) => {
        if (id) resolvers.set(id, resolve);
      }),
  );

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "Open first.txt" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Open second.txt" }));
  resolvers.get("second")?.(new Blob(["second content"]));
  expect(await screen.findByText("second content")).toBeVisible();

  resolvers.get("first")?.(new Blob(["stale first content"]));
  await waitFor(() =>
    expect(screen.queryByText("stale first content")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("dialog", { name: "second.txt" })).toBeVisible();
});

test("Escape closes the preview, restores focus, and releases object URLs", async () => {
  const repository = repositoryWith([
    artifact({
      id: "image-escape",
      name: "escape.png",
      mimeType: "image/png",
      extension: "png",
      category: "image",
    }),
  ]);
  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  const openButton = await screen.findByRole("button", {
    name: "Open escape.png",
  });
  fireEvent.click(openButton);
  expect(
    await screen.findByRole("dialog", { name: "escape.png" }),
  ).toBeVisible();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(openButton).toHaveFocus();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

test("uses the Canvas PDF renderer instead of an iframe", async () => {
  const repository = repositoryWith([
    artifact({
      id: "pdf-1",
      name: "brief.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
    }),
  ]);
  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "Open brief.pdf" }),
  );
  expect(await screen.findByTestId("pdf-canvas-preview")).toBeVisible();
  expect(document.querySelector("iframe")).not.toBeInTheDocument();
});

test("keeps the image card usable when thumbnail loading fails", async () => {
  const repository = repositoryWith([
    artifact({
      id: "image-1",
      name: "unavailable.png",
      mimeType: "image/png",
      extension: "png",
      category: "image",
    }),
  ]);
  repository.getBlob.mockRejectedValue(new Error("storage unavailable"));

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole("button", { name: "Open unavailable.png" }),
  ).toBeVisible();
  await waitFor(() =>
    expect(repository.getBlob).toHaveBeenCalledWith("image-1"),
  );
});

test("reports a missing original when download cannot load a blob", async () => {
  const repository = repositoryWith([
    artifact({ id: "missing-1", name: "missing.txt" }),
  ]);
  repository.getBlob.mockResolvedValue(undefined);

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "Download missing.txt" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The saved file is unavailable.",
  );
});

test("removes an artifact only after deletion is confirmed", async () => {
  const repository = repositoryWith([
    artifact({ id: "code-1", name: "client.ts", category: "code" }),
  ]);

  render(
    <MemoryRouter>
      <ArtifactLibraryPage repository={repository} />
    </MemoryRouter>,
  );

  expect(await screen.findByText("client.ts")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Delete client.ts" }));

  expect(repository.remove).not.toHaveBeenCalled();
  const confirmation = await screen.findByText(
    "Delete client.ts from the library?",
  );
  const modal = confirmation.closest(".modal-container");
  const confirmButton = modal?.querySelector(
    ".modal-actions .modal-action:last-child button",
  );
  expect(confirmButton).toBeInstanceOf(HTMLButtonElement);
  fireEvent.click(confirmButton as HTMLButtonElement);

  await waitFor(() => {
    expect(repository.remove).toHaveBeenCalledWith("code-1");
  });
});
