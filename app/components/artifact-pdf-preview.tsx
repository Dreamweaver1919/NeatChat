"use client";

import React, { useEffect, useRef, useState } from "react";
import Locale from "../locales";
import styles from "./artifact-pdf-preview.module.scss";

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void> | void;
};

type PdfPage = {
  getViewport(options: { scale: number }): {
    width: number;
    height: number;
  };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): {
    promise: Promise<void>;
    cancel(): void;
  };
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void> | void;
};

type PdfJs = {
  getDocument(options: { data: Uint8Array }): PdfLoadingTask;
};

export interface ArtifactPdfPreviewProps {
  blob: Blob;
  fileName: string;
  url?: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;
const CANVAS_REVEAL_TIMEOUT = 800;
const PDF_LOAD_TIMEOUT = 2_000;
const CONTROL_STYLE = { minWidth: 44, minHeight: 44 };
let pdfTeardown = Promise.resolve();

// The webpack entry creates a module Worker from PDF.js's local bundled asset.
async function loadPdfJs(): Promise<PdfJs> {
  return (await import("pdfjs-dist/webpack.mjs")) as PdfJs;
}

export function ArtifactPdfPreview({
  blob,
  fileName,
  url,
}: ArtifactPdfPreviewProps) {
  const copy = Locale.ArtifactLibrary;
  const { PdfPasswordProtected, PdfUnavailable } = copy;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument>();
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [nativeFallback, setNativeFallback] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let fallbackSelected = false;
    let loadingTask: PdfLoadingTask | undefined;
    let pdfDocument: PdfDocument | undefined;
    const selectNativeFallback = () => {
      fallbackSelected = true;
      if (active) setNativeFallback(true);
      void destroyPdfResource(() => loadingTask?.destroy());
    };
    const loadFallbackTimer = window.setTimeout(
      selectNativeFallback,
      PDF_LOAD_TIMEOUT,
    );

    setPdfDocument(undefined);
    setPageNumber(1);
    setZoom(1);
    setRendering(true);
    setNativeFallback(false);
    setError(undefined);

    void (async () => {
      try {
        const [pdfjs, buffer] = await Promise.all([
          loadPdfJs(),
          blob.arrayBuffer(),
        ]);
        if (!active || fallbackSelected) return;
        const teardownReady = await settlesWithin(
          pdfTeardown,
          PDF_LOAD_TIMEOUT,
        );
        if (!teardownReady) {
          selectNativeFallback();
          return;
        }
        if (!active || fallbackSelected) return;

        loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
        pdfDocument = await loadingTask.promise;
        if (!active || fallbackSelected) {
          queuePdfTeardown(() => pdfDocument?.destroy());
          return;
        }

        window.clearTimeout(loadFallbackTimer);
        setPdfDocument(pdfDocument);
      } catch (reason) {
        if (active && !fallbackSelected)
          setError(
            toPreviewError(reason, PdfPasswordProtected, PdfUnavailable),
          );
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(loadFallbackTimer);
      const task = loadingTask;
      const document = pdfDocument;
      queuePdfTeardown(async () => {
        await destroyPdfResource(() => task?.destroy());
        await destroyPdfResource(() => document?.destroy());
      });
    };
  }, [PdfPasswordProtected, PdfUnavailable, blob]);

  useEffect(() => {
    if (!pdfDocument) return;

    let active = true;
    let fallbackSelected = false;
    let renderTask: ReturnType<PdfPage["render"]> | undefined;
    let revealTimer: number | undefined;
    setRendering(true);

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!active || !canvas || !context) return;

        const viewport = page.getViewport({ scale: zoom });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        renderTask = page.render({ canvasContext: context, viewport });
        const revealFallback = new Promise<boolean>((resolve) => {
          revealTimer = window.setTimeout(
            () => resolve(false),
            CANVAS_REVEAL_TIMEOUT,
          );
        });
        const painted = await Promise.race([
          renderTask.promise.then(() => true),
          revealFallback,
        ]);
        if (painted && revealTimer !== undefined)
          window.clearTimeout(revealTimer);
        if (active) {
          if (painted) setRendering(false);
          else {
            fallbackSelected = true;
            renderTask.cancel();
            setNativeFallback(true);
            return;
          }
        }
        await renderTask.promise;
      } catch (reason) {
        if (active && !fallbackSelected && !isRenderCancellation(reason))
          setError(
            toPreviewError(reason, PdfPasswordProtected, PdfUnavailable),
          );
      }
    })();

    return () => {
      active = false;
      if (revealTimer !== undefined) window.clearTimeout(revealTimer);
      renderTask?.cancel();
    };
  }, [PdfPasswordProtected, PdfUnavailable, pageNumber, pdfDocument, zoom]);

  const downloadOriginal = () => {
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    globalThis.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  if (error) {
    return (
      <section className={styles.error} aria-label={`${fileName} PDF preview`}>
        <p role="alert">{error}</p>
        <button type="button" onClick={downloadOriginal}>
          {copy.DownloadOriginal}
        </button>
      </section>
    );
  }

  if (nativeFallback) {
    return url ? (
      <object
        className={styles.native}
        data={url}
        type="application/pdf"
        aria-label={`${fileName} PDF preview`}
        data-testid="artifact-pdf-native-preview"
      >
        <button type="button" onClick={downloadOriginal}>
          {copy.DownloadOriginal}
        </button>
      </object>
    ) : (
      <section className={styles.error} aria-label={`${fileName} PDF preview`}>
        <p role="alert">{copy.PdfUnavailable}</p>
        <button type="button" onClick={downloadOriginal}>
          {copy.DownloadOriginal}
        </button>
      </section>
    );
  }

  if (!pdfDocument) {
    return (
      <div
        className={styles.skeleton}
        data-testid="artifact-pdf-skeleton"
        aria-busy="true"
      >
        <span>{copy.PdfLoading}</span>
      </div>
    );
  }

  return (
    <section className={styles.preview} aria-label={`${fileName} PDF preview`}>
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label={copy.PdfControls}
      >
        <button
          type="button"
          aria-label={copy.PreviousPage}
          title={copy.PreviousPage}
          style={CONTROL_STYLE}
          disabled={pageNumber === 1}
          onClick={() => {
            setRendering(true);
            setPageNumber((page) => Math.max(1, page - 1));
          }}
        >
          {"<"}
        </button>
        <span aria-live="polite">
          {pageNumber} / {pdfDocument.numPages}
        </span>
        <button
          type="button"
          aria-label={copy.NextPage}
          title={copy.NextPage}
          style={CONTROL_STYLE}
          disabled={pageNumber === pdfDocument.numPages}
          onClick={() => {
            setRendering(true);
            setPageNumber((page) => Math.min(pdfDocument.numPages, page + 1));
          }}
        >
          {">"}
        </button>
        <button
          type="button"
          aria-label={copy.ZoomOut}
          title={copy.ZoomOut}
          style={CONTROL_STYLE}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => {
            setRendering(true);
            setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP));
          }}
        >
          -
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label={copy.ZoomIn}
          title={copy.ZoomIn}
          style={CONTROL_STYLE}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => {
            setRendering(true);
            setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));
          }}
        >
          +
        </button>
      </div>
      <div className={styles.canvasWrap}>
        {rendering && (
          <div
            className={styles.skeleton}
            data-testid="artifact-pdf-skeleton"
            aria-busy="true"
          >
            <span>{copy.PdfLoading}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          role={rendering ? undefined : "img"}
          aria-label={
            rendering
              ? undefined
              : `Page ${pageNumber} of ${pdfDocument.numPages}`
          }
          aria-hidden={rendering}
          className={[
            rendering ? styles["canvas-loading"] : "",
            !rendering && zoom <= 1 ? styles["fit-width"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
    </section>
  );
}

function queuePdfTeardown(action: () => Promise<void> | void): void {
  pdfTeardown = pdfTeardown
    .catch(() => undefined)
    .then(action)
    .catch(() => undefined);
}

async function settlesWithin(
  promise: Promise<unknown>,
  timeout: number,
): Promise<boolean> {
  let timer: number | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = window.setTimeout(() => resolve(false), timeout);
  });
  const settled = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    timedOut,
  ]);
  if (timer !== undefined) window.clearTimeout(timer);
  return settled;
}

async function destroyPdfResource(
  destroy: () => Promise<void> | void | undefined,
): Promise<void> {
  try {
    await destroy();
  } catch {
    // Teardown must not poison the shared PDF.js worker queue.
  }
}

function isRenderCancellation(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    ["AbortError", "RenderingCancelledException"].includes(reason.name)
  );
}

function toPreviewError(
  reason: unknown,
  passwordProtected: string,
  unavailable: string,
): string {
  if (reason instanceof Error && reason.name === "PasswordException") {
    return passwordProtected;
  }
  return unavailable;
}
