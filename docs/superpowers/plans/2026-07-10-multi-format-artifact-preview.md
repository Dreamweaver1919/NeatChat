# Multi-Format Artifact Preview Implementation Plan

> **For agentic workers:** Use subagent-driven development. Keep this plan under 70 lines and update statuses in place.

**Goal:** Every saved artifact opens a responsive local content preview or an explicit metadata/download fallback; Safari PDF preview must never be blank.

**Architecture:** A preview factory detects format and returns a typed model. Focused renderers handle PDF Canvas, structured documents, media, and binary fallback; the library page owns request cancellation, loading/error state, and focus recovery.

**Tech Stack:** React 18, TypeScript, SCSS, PDF.js, Mammoth, SheetJS, JSZip, heic2any, Jest, Browser/Computer Use.

## Global Constraints

- Local-only parsing; no online viewer, file upload, script/macro execution, or new dependency.
- Preserve original Blob, 25 MB/file and 250 MB/library limits, download/delete behavior, and `/artifacts/:id`.
- First feedback under 100 ms; lazy dynamic imports; bounded rows/pages/entries; stale requests cannot overwrite current preview.
- All generated agentic Markdown stays under 70 lines; audit docs and `AGENTS.md` stay under 60.

### Task 1: Preview Model and Detection

**Files:** Create `app/artifacts/preview.ts`; test `test/artifact-preview.test.ts`.

- [x] RED: tests for MIME/extension/signature detection, text limits, unknown binary hex fallback, abort, and cleanup.
- [x] Implement `ArtifactPreviewModel`, `detectPreviewType(metadata, blob)`, `createArtifactPreview(metadata, blob, signal)` and `disposeArtifactPreview(model)`.
- [x] Support text/code/JSON/CSV, image, HEIC detection, audio/video, PDF dispatch, and binary metadata; HEIC conversion is Task 3.
- [x] GREEN: focused Jest, TypeScript, targeted ESLint; commit model foundation.

### Task 2: Safari-Safe PDF Canvas Viewer

**Files:** Create `app/components/artifact-pdf-preview.tsx` and module SCSS; test `test/artifact-pdf-preview.test.tsx`.

- [x] RED: mocked PDF.js tests for skeleton, render, controls, cancellation, fallback, failure, and teardown.
- [x] Dynamically import local PDF.js worker, render one Canvas page, and expose 44 px controls.
- [x] Remove PDF iframe; use local native object fallback plus download for stalled/encrypted/corrupt files.
- [x] GREEN: focused Jest, TypeScript, targeted ESLint; PDF viewer verified in Safari.

### Task 3: Structured Local Parsers

**Files:** Create `app/artifacts/preview-parsers.ts`; test `test/artifact-preview-parsers.test.ts`.

- [x] RED: generated DOCX/XLSX/PPTX/ZIP fixtures plus malformed, forged, and legacy fallback tests.
- [x] Implement bounded Office/ZIP parsers with streamed ZIP inflation verification.
- [x] HEIC URLs are disposable; HTML/SVG non-executable; failures return binary fallback.
- [x] GREEN: focused Jest, TypeScript and targeted ESLint pass.

### Task 4: Preview Surface Integration

**Files:** Create `app/components/artifact-preview.tsx` and SCSS; modify library component/SCSS and `app/locales/{cn,en}.ts`; extend page tests.

- [x] RED: tests cover skeleton, renderers, stale suppression, errors, Escape/focus and disposal.
- [x] Render text/document, sheets, slides, archive, image/media, PDF and binary views.
- [x] Responsive at 390 px/desktop; parser and Canvas stalls never leave permanent blank state.
- [x] GREEN: focused/full Jest, TypeScript, Prettier and ESLint pass.

### Task 5: Browser Matrix and Delivery

**Files:** Update `docs/audits/neatchat-web-ui/{debug-plan,audit-notes}.md` in place.

- [x] Validate real PDF/PNG in browsers and generated text/Office/ZIP/media/binary models in tests.
- [x] Verify immediate skeleton, rapid switch, 1512x805/390x844, console and URL cleanup.
- [x] Run 80 Jest tests, TypeScript, Prettier, ESLint and standalone build.
- [ ] Keep Markdown limits, final review, commit, push branch, and update Draft PR #1.
