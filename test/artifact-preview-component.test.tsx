import { fireEvent, render, screen } from "@testing-library/react";
import { ArtifactPreview } from "../app/components/artifact-preview";
import type { ArtifactPreviewModel } from "../app/artifacts/preview";

jest.mock("../app/components/artifact-pdf-preview", () => ({
  ArtifactPdfPreview: ({ fileName }: { fileName: string }) => (
    <div data-testid="pdf-canvas-preview">{fileName}</div>
  ),
}));

const labels = {
  loading: "Loading preview...",
  download: "Download",
  unsupported: "Preview unavailable",
  sheet: "Sheet",
  slide: "Slide",
  archiveEmpty: "Archive is empty",
  binary: "Binary preview",
  type: "Type",
  size: "Size",
  truncated: "Preview truncated",
};

function model(override: Partial<ArtifactPreviewModel>): ArtifactPreviewModel {
  return {
    kind: "binary",
    status: "ready",
    title: "sample.bin",
    mimeType: "application/octet-stream",
    size: 4,
    updatedAt: 1,
    blob: new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef])]),
    ...override,
  };
}

test("renders escaped text and structured document content", () => {
  const { rerender } = render(
    <ArtifactPreview
      model={model({ kind: "text", content: "<script>unsafe()</script>" })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );

  expect(screen.getByText("<script>unsafe()</script>")).toBeVisible();
  expect(document.querySelector("script")).not.toBeInTheDocument();

  rerender(
    <ArtifactPreview
      model={model({
        kind: "document",
        structured: {
          type: "document",
          blocks: ["Heading", "Body"],
          truncated: false,
        },
      })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(screen.getByText("Heading")).toBeVisible();
  expect(screen.getByText("Body")).toBeVisible();
});

test("renders spreadsheet tabs and switches sheets", () => {
  render(
    <ArtifactPreview
      model={model({
        kind: "spreadsheet",
        structured: {
          type: "spreadsheet",
          truncated: false,
          sheets: [
            { name: "Summary", rows: [["Total", "4"]], truncated: false },
            { name: "Data", rows: [["Name", "Ada"]], truncated: false },
          ],
        },
      })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );

  expect(screen.getByText("Total")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Data" }));
  expect(screen.getByText("Ada")).toBeVisible();
  expect(screen.queryByText("Total")).not.toBeInTheDocument();
});

test("renders slides, archive entries, and bounded binary fallback", () => {
  const { rerender } = render(
    <ArtifactPreview
      model={model({
        kind: "presentation",
        structured: {
          type: "presentation",
          slides: [{ index: 1, blocks: ["Roadmap"], truncated: false }],
          truncated: false,
        },
      })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(screen.getByText("Slide 1")).toBeVisible();
  expect(screen.getByText("Roadmap")).toBeVisible();

  rerender(
    <ArtifactPreview
      model={model({
        kind: "zip",
        structured: {
          type: "zip",
          entries: [
            {
              path: "src/index.ts",
              directory: false,
              size: 12,
              textSample: "export {};",
            },
          ],
          truncated: false,
        },
      })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(screen.getByText("src/index.ts")).toBeVisible();
  expect(screen.getByText("export {};")).toBeVisible();

  rerender(
    <ArtifactPreview
      model={model({ hex: "de ad be ef", warning: "Unknown format" })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Unknown format");
  expect(screen.getByText("de ad be ef")).toBeVisible();
});

test("renders image, media, and PDF through safe local elements", () => {
  const { rerender } = render(
    <ArtifactPreview
      model={model({ kind: "image", url: "blob:image" })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(screen.getByRole("img", { name: "sample.bin" })).toBeVisible();

  rerender(
    <ArtifactPreview
      model={model({ kind: "media", mediaType: "audio", url: "blob:audio" })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(document.querySelector("audio")).toBeInTheDocument();

  rerender(
    <ArtifactPreview
      model={model({ kind: "pdf" })}
      labels={labels}
      onDownload={jest.fn()}
    />,
  );
  expect(screen.getByTestId("pdf-canvas-preview")).toBeVisible();
  expect(document.querySelector("iframe")).not.toBeInTheDocument();
});

test("always offers the original file when preview data is unavailable", () => {
  const onDownload = jest.fn();
  render(
    <ArtifactPreview
      model={model({ status: "unsupported", warning: "Could not parse" })}
      labels={labels}
      onDownload={onDownload}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("Could not parse");
  fireEvent.click(screen.getByRole("button", { name: "Download" }));
  expect(onDownload).toHaveBeenCalledTimes(1);
});
