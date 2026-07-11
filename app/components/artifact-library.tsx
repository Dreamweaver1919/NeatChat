"use client";
/* eslint-disable @next/next/no-img-element */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CloseIcon from "../icons/close.svg";
import DeleteIcon from "../icons/delete.svg";
import DownloadIcon from "../icons/download.svg";
import FileIcon from "../icons/file.svg";
import ImageIcon from "../icons/image.svg";
import ReturnIcon from "../icons/return.svg";
import { Path } from "../constant";
import Locale from "../locales";
import {
  filterArtifacts,
  type ArtifactFilter,
  type ArtifactMetadata,
} from "../artifacts/library";
import {
  createArtifactPreview,
  disposeArtifactPreview,
  type ArtifactPreviewModel,
} from "../artifacts/preview";
import {
  ARTIFACT_LIBRARY_CHANGED,
  artifactRepository,
  type ArtifactRepository,
} from "../artifacts/repository";
import { IconButton } from "./button";
import { ArtifactPreview } from "./artifact-preview";
import { showConfirm } from "./ui-lib";
import styles from "./artifact-library.module.scss";
import { useNavigate } from "react-router-dom";

export type ArtifactLibraryRepository = Pick<
  ArtifactRepository,
  "list" | "getBlob" | "remove"
>;

interface PreviewState {
  item: ArtifactMetadata;
  status: "loading" | "ready" | "error";
  model?: ArtifactPreviewModel;
  error?: string;
}

const FILTERS: ArtifactFilter[] = ["all", "document", "code", "image", "other"];

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ArtifactCardVisual({
  item,
  repository,
}: {
  item: ArtifactMetadata;
  repository: ArtifactLibraryRepository;
}) {
  const [thumbnail, setThumbnail] = useState<string>();

  useEffect(() => {
    if (item.category !== "image") return;
    let active = true;
    let objectUrl: string | undefined;

    void repository
      .getBlob(item.id)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnail(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.category, item.id, repository]);

  if (thumbnail) {
    return (
      <img
        className={styles.thumbnail}
        src={thumbnail}
        alt={`${item.name} thumbnail`}
      />
    );
  }

  if (item.category === "code" && item.previewText) {
    return <pre className={styles["code-thumbnail"]}>{item.previewText}</pre>;
  }

  return item.category === "image" ? (
    <ImageIcon aria-hidden="true" />
  ) : (
    <FileIcon aria-hidden="true" />
  );
}

export function ArtifactLibraryPage({
  repository = artifactRepository,
}: {
  repository?: ArtifactLibraryRepository;
}) {
  const navigate = useNavigate();
  const copy = Locale.ArtifactLibrary;
  const [items, setItems] = useState<ArtifactMetadata[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArtifactFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<PreviewState>();
  const previewRequest = useRef(0);
  const previewAbort = useRef<AbortController>();
  const previewModel = useRef<ArtifactPreviewModel>();
  const previewTrigger = useRef<HTMLButtonElement | null>(null);

  const releasePreview = useCallback(() => {
    previewAbort.current?.abort();
    previewAbort.current = undefined;
    if (previewModel.current) {
      disposeArtifactPreview(previewModel.current);
      previewModel.current = undefined;
    }
  }, []);

  const closePreview = useCallback(() => {
    previewRequest.current += 1;
    releasePreview();
    setPreview(undefined);
    previewTrigger.current?.focus();
  }, [releasePreview]);

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await repository.list());
      setError(undefined);
    } catch {
      setError(copy.LoadError);
    } finally {
      setLoading(false);
    }
  }, [copy.LoadError, repository]);

  useEffect(() => {
    void loadArtifacts();
    window.addEventListener(ARTIFACT_LIBRARY_CHANGED, loadArtifacts);
    return () =>
      window.removeEventListener(ARTIFACT_LIBRARY_CHANGED, loadArtifacts);
  }, [loadArtifacts]);

  useEffect(
    () => () => {
      previewRequest.current += 1;
      releasePreview();
    },
    [releasePreview],
  );

  useEffect(() => {
    if (!preview) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePreview, preview]);

  const filteredItems = useMemo(
    () => filterArtifacts(items, query, filter),
    [filter, items, query],
  );

  const openPreview = useCallback(
    async (item: ArtifactMetadata) => {
      const request = ++previewRequest.current;
      releasePreview();
      const controller = new AbortController();
      previewAbort.current = controller;
      setPreview({ item, status: "loading" });

      try {
        const blob = await repository.getBlob(item.id);
        if (request !== previewRequest.current || controller.signal.aborted)
          return;
        if (!blob) {
          setPreview({ item, status: "error", error: copy.MissingFile });
          return;
        }

        const model = await createArtifactPreview(
          item,
          blob,
          controller.signal,
        );
        if (request !== previewRequest.current || controller.signal.aborted) {
          disposeArtifactPreview(model);
          return;
        }
        previewModel.current = model;
        setPreview({ item, status: "ready", model });
      } catch (reason) {
        if (
          request === previewRequest.current &&
          !controller.signal.aborted &&
          !isAbortError(reason)
        ) {
          setPreview({ item, status: "error", error: copy.PreviewError });
        }
      } finally {
        if (previewAbort.current === controller) {
          previewAbort.current = undefined;
        }
      }
    },
    [copy.MissingFile, copy.PreviewError, releasePreview, repository],
  );

  const download = useCallback(
    async (item: ArtifactMetadata) => {
      try {
        const blob = await repository.getBlob(item.id);
        if (!blob) {
          setError(copy.MissingFile);
          return;
        }

        downloadBlob(blob, item.name);
      } catch {
        setError(copy.DownloadError);
      }
    },
    [copy.DownloadError, copy.MissingFile, repository],
  );

  const remove = useCallback(
    async (item: ArtifactMetadata) => {
      if (!(await showConfirm(copy.DeleteConfirm(item.name)))) return;

      try {
        await repository.remove(item.id);
        if (preview?.item.id === item.id) closePreview();
        await loadArtifacts();
      } catch {
        setError(copy.DeleteError);
      }
    },
    [closePreview, copy, loadArtifacts, preview?.item.id, repository],
  );

  const filterLabels: Record<ArtifactFilter, string> = {
    all: copy.Filters.All,
    document: copy.Filters.Document,
    code: copy.Filters.Code,
    image: copy.Filters.Image,
    other: copy.Filters.Other,
  };

  return (
    <section
      className={styles["artifact-library"]}
      aria-labelledby="artifact-library-title"
    >
      <header className={styles.header}>
        <div>
          <h1 id="artifact-library-title">{copy.Title}</h1>
          <p>{copy.Subtitle}</p>
          <span className={styles.count}>{copy.ItemCount(items.length)}</span>
        </div>
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="artifact-search">{copy.Search}</label>
          <input
            id="artifact-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.SearchPlaceholder}
          />
        </form>
      </header>

      <div
        className={styles.filters}
        role="group"
        aria-label={copy.FilterLabel}
      >
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={filter === value ? styles.selected : undefined}
            onClick={() => setFilter(value)}
          >
            {filterLabels[value]}
          </button>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className={styles["loading-grid"]} aria-label={copy.Loading}>
          {[0, 1, 2].map((item) => (
            <span key={item} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <FileIcon aria-hidden="true" />
          <p>{copy.Empty}</p>
          <button type="button" onClick={() => navigate(Path.Chat)}>
            {copy.ReturnToChat}
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.empty}>
          <p>{copy.NoMatch}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredItems.map((item) => (
            <article className={styles["artifact-card"]} key={item.id}>
              <button
                type="button"
                className={styles["artifact-open"]}
                aria-label={`${copy.Open} ${item.name}`}
                onClick={(event) => {
                  previewTrigger.current = event.currentTarget;
                  void openPreview(item);
                }}
              >
                <ArtifactCardVisual item={item} repository={repository} />
                <span>{item.name}</span>
              </button>
              <div className={styles.metadata}>
                <span>{filterLabels[item.category]}</span>
                <span>{formatSize(item.size)}</span>
                <time dateTime={new Date(item.updatedAt).toISOString()}>
                  {new Date(item.updatedAt).toLocaleDateString()}
                </time>
              </div>
              <div className={styles.actions}>
                <IconButton
                  icon={<DownloadIcon />}
                  aria={`${copy.Download} ${item.name}`}
                  title={copy.Download}
                  onClick={() => void download(item)}
                />
                <IconButton
                  icon={<DeleteIcon />}
                  aria={`${copy.Delete} ${item.name}`}
                  title={copy.Delete}
                  onClick={() => void remove(item)}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <aside
          className={styles.preview}
          role="dialog"
          aria-modal="true"
          aria-label={preview.item.name}
        >
          <header className={styles["preview-header"]}>
            <div>
              <p>{copy.Preview}</p>
              <h2>{preview.item.name}</h2>
            </div>
            <IconButton
              className={styles["close-preview"]}
              icon={<CloseIcon />}
              aria={copy.ClosePreview}
              title={copy.ClosePreview}
              autoFocus
              onClick={closePreview}
            />
            <IconButton
              className={styles["return-preview"]}
              icon={<ReturnIcon />}
              aria={copy.BackToLibrary}
              title={copy.BackToLibrary}
              onClick={closePreview}
            />
          </header>
          <div className={styles["preview-content"]}>
            {preview.status === "loading" ? (
              <div
                className={styles["preview-skeleton"]}
                aria-label={copy.PreviewLoading}
                aria-busy="true"
              >
                <span />
                <span />
                <p>{copy.PreviewLoading}</p>
              </div>
            ) : preview.status === "error" ? (
              <div className={styles["preview-error"]}>
                <p role="alert">{preview.error}</p>
                <button
                  type="button"
                  onClick={() => void download(preview.item)}
                >
                  {copy.Download}
                </button>
              </div>
            ) : preview.model ? (
              <ArtifactPreview
                model={preview.model}
                labels={{
                  loading: copy.PreviewLoading,
                  download: copy.Download,
                  unsupported: copy.UnsupportedPreview,
                  sheet: copy.Sheet,
                  slide: copy.Slide,
                  archiveEmpty: copy.ArchiveEmpty,
                  binary: copy.BinaryPreview,
                  type: copy.Type,
                  size: copy.Size,
                  truncated: copy.PreviewTruncated,
                }}
                onDownload={() => void download(preview.item)}
              />
            ) : (
              <p role="alert">{copy.PreviewError}</p>
            )}
          </div>
        </aside>
      )}
    </section>
  );
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "AbortError";
}
