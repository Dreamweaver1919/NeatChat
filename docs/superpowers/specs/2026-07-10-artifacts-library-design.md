# Artifacts Library Design

Date: 2026-07-10
Status: approved for implementation planning

## Goal

Add a local-first Artifacts Library that automatically records files the user uploads in chat. The page is reached from the sidebar and supports search, type filtering, preview, download, and deletion without slowing or blocking chat uploads.

The library starts collecting after this feature ships. Historical chat messages are not backfilled because current messages do not retain reliable original-file metadata. The page does not offer independent uploads.

## Routing and Compatibility

- `/artifacts` is the authenticated in-app library page rendered inside the normal sidebar shell.
- `/artifacts/:id` remains the existing full-screen shared HTML artifact preview.
- Add an Artifacts sidebar action with a dedicated icon and localized accessible name.
- Mobile navigation includes an explicit return path instead of relying on blank-area navigation.

## Storage Architecture

Use a repository module backed by a dedicated IndexedDB database and store. Each record contains metadata plus the original `Blob`; Zustand is not used for binary data.

Metadata fields: `id`, `fingerprint`, `name`, `mimeType`, `extension`, `category`, `size`, `createdAt`, `updatedAt`, `lastModified`, and optional `sessionId`. Categories are `document`, `code`, `image`, and `other`.

The fingerprint is derived from normalized name, size, and `lastModified`. Re-uploading the same fingerprint updates `updatedAt` and session context instead of creating another card. This avoids hashing large files in the upload path.

Limits are 25 MB per file and a 250 MB soft library cap. Exceeding either limit prevents only library collection; the existing chat upload continues. Metadata lists are read without loading blobs. Blobs are fetched only for preview or download.

## Upload Integration

The attachment picker and clipboard paths first apply the existing limits of five documents and three images. Only accepted real `File` objects are queued for library persistence. Ordinary long text that is automatically converted into an attachment is excluded.

Parsing, remote image preparation, and library persistence run independently. Library writes are asynchronous and never gate attachment display or message sending. The attachment helper returns accepted image files alongside generated image URLs so original images can be stored.

Failures are reported through a concise toast with distinct messages for unsupported storage, per-file size, total capacity, and write failure. A library failure never clears the selected attachment or changes the outgoing message.

## Library UI

Use the approved adaptive grid direction. The header contains title, item count, search, and newest-first ordering. A segmented control filters `All`, `Documents`, `Code`, `Images`, and `Other`.

Desktop uses three or four columns, tablet two or three, and mobile one. Image cards use generated object URLs for thumbnails; code cards show a short safe text preview; document and other cards show type icon, extension, size, and upload time. Cards have stable dimensions and at least 44 px action targets.

Selecting a card opens a right-side preview drawer on desktop and a full-screen sheet on mobile. Text and code render as plain escaped text, images use contained original previews, and PDFs use the browser viewer. Unsupported formats show metadata and a download action. Object URLs are revoked when no longer needed.

Each card menu contains Download and Delete. Delete requires confirmation and removes only the library copy, never chat history. The empty state explains automatic collection and offers a Return to chat action.

## State and Feedback

The page owns query, category, selected item, loading, and error state. Pure helpers handle classification, filtering, sorting, fingerprinting, size formatting, and preview capability. Repository events refresh an open library page after new chat uploads.

All route and filter transitions provide visible feedback within 100 ms. Loading uses stable skeleton dimensions; empty, error, capacity, and unsupported-preview states use explicit text and actions. Keyboard focus moves into the preview and returns to the originating card on close.

## Testing and Acceptance

- Unit tests: MIME/extension classification, filtering, search, newest-first sort, fingerprint deduplication, limits, and preview selection.
- Repository tests: add, metadata-only list, lazy blob read, deduplicate/update, delete, and quota error mapping.
- Browser tests: sidebar entry, empty state, real pasted attachment collection, each filter, preview, download, delete confirmation, and chat non-blocking behavior.
- Responsive checks: desktop 1512x805, laptop 1280x720, tablet 768x1024, and mobile 390x844 in light and dark themes.
- Performance checks: visible click feedback under 100 ms; library metadata shell under 500 ms after route signal on a warm local build.
- Final commands: `corepack yarn@1.22.19 lint`, `corepack yarn@1.22.19 test:ci`, and `corepack yarn@1.22.19 build`.

No production model request, deployment, network upload, or historical-data migration is part of this feature.
