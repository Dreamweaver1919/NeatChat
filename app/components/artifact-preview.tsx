"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import type { ArtifactPreviewModel } from "../artifacts/preview";
import { ArtifactPdfPreview } from "./artifact-pdf-preview";
import styles from "./artifact-preview.module.scss";

export interface ArtifactPreviewLabels {
  loading: string;
  download: string;
  unsupported: string;
  sheet: string;
  slide: string;
  archiveEmpty: string;
  binary: string;
  type: string;
  size: string;
  truncated: string;
}

export function ArtifactPreview({
  model,
  labels,
  onDownload,
}: {
  model: ArtifactPreviewModel;
  labels: ArtifactPreviewLabels;
  onDownload: () => void;
}) {
  const [sheetIndex, setSheetIndex] = useState(0);

  useEffect(() => setSheetIndex(0), [model]);

  const warning = model.warning ? (
    <p className={styles.warning} role="alert">
      {model.warning}
    </p>
  ) : null;

  const fallback = (
    <PreviewFallback model={model} labels={labels} onDownload={onDownload} />
  );

  let content: React.ReactNode = fallback;
  if (model.kind === "pdf") {
    content = (
      <ArtifactPdfPreview
        blob={model.blob}
        fileName={model.title}
        url={model.url}
      />
    );
  } else if ((model.kind === "image" || model.kind === "heic") && model.url) {
    content = (
      <img className={styles.image} src={model.url} alt={model.title} />
    );
  } else if (model.kind === "media" && model.url) {
    content =
      model.mediaType === "audio" ? (
        <audio
          className={styles.audio}
          src={model.url}
          controls
          preload="metadata"
        />
      ) : (
        <video
          className={styles.video}
          src={model.url}
          controls
          preload="metadata"
        />
      );
  } else if (model.kind === "text" && model.content !== undefined) {
    content = <pre className={styles.text}>{model.content}</pre>;
  } else if (model.structured?.type === "document") {
    content = (
      <article className={styles.document}>
        {model.structured.blocks.map((block, index) => (
          <p key={`${index}-${block.slice(0, 24)}`}>{block}</p>
        ))}
      </article>
    );
  } else if (model.structured?.type === "spreadsheet") {
    const sheets = model.structured.sheets;
    const activeSheet = sheets[sheetIndex] ?? sheets[0];
    content = activeSheet ? (
      <div className={styles.spreadsheet}>
        <div className={styles.tabs} role="tablist" aria-label={labels.sheet}>
          {sheets.map((sheet, index) => (
            <button
              key={`${index}-${sheet.name}`}
              type="button"
              role="tab"
              aria-selected={index === sheetIndex}
              onClick={() => setSheetIndex(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
        <div className={styles["table-scroll"]}>
          <table>
            <tbody>
              {activeSheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      fallback
    );
  } else if (model.structured?.type === "presentation") {
    content = (
      <div className={styles.presentation}>
        {model.structured.slides.map((slide) => (
          <section key={slide.index}>
            <h3>
              {labels.slide} {slide.index}
            </h3>
            {slide.blocks.length > 0 ? (
              slide.blocks.map((block, index) => <p key={index}>{block}</p>)
            ) : (
              <p>{labels.unsupported}</p>
            )}
          </section>
        ))}
      </div>
    );
  } else if (model.structured?.type === "zip") {
    content =
      model.structured.entries.length > 0 ? (
        <ul className={styles.archive}>
          {model.structured.entries.map((entry) => (
            <li key={entry.path}>
              <strong>{entry.path}</strong>
              {!entry.directory && <span>{formatSize(entry.size)}</span>}
              {entry.textSample !== undefined && <pre>{entry.textSample}</pre>}
            </li>
          ))}
        </ul>
      ) : (
        <p>{labels.archiveEmpty}</p>
      );
  }

  return (
    <div className={styles.preview} data-preview-kind={model.kind}>
      {warning}
      {content}
      {(model.truncated || model.structured?.truncated) && (
        <p className={styles.truncated}>{labels.truncated}</p>
      )}
    </div>
  );
}

function PreviewFallback({
  model,
  labels,
  onDownload,
}: {
  model: ArtifactPreviewModel;
  labels: ArtifactPreviewLabels;
  onDownload: () => void;
}) {
  return (
    <div className={styles.fallback}>
      <h3>{labels.binary}</h3>
      <dl>
        <div>
          <dt>{labels.type}</dt>
          <dd>{model.mimeType || "application/octet-stream"}</dd>
        </div>
        <div>
          <dt>{labels.size}</dt>
          <dd>{formatSize(model.size)}</dd>
        </div>
      </dl>
      {model.hex && <pre>{model.hex}</pre>}
      {!model.warning && model.status === "unsupported" && (
        <p role="alert">{labels.unsupported}</p>
      )}
      <button type="button" onClick={onDownload}>
        {labels.download}
      </button>
    </div>
  );
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
