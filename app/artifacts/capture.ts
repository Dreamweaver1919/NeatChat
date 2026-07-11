import {
  ArtifactLibraryError,
  ArtifactRepository,
  artifactRepository,
} from "./repository";

export type ArtifactCaptureFailure = ArtifactLibraryError["code"];
export type ArtifactCaptureMessages = Record<ArtifactCaptureFailure, string>;

export interface ArtifactCaptureResult {
  saved: number;
  failures: ArtifactCaptureFailure[];
}

export type ArtifactCaptureSource =
  | "picker"
  | "clipboard-file"
  | "generated-long-text";

export interface ArtifactCaptureSelection {
  selectedFiles: readonly File[];
  selectedImageFiles: readonly File[];
}

export async function captureArtifacts(
  files: readonly File[],
  sessionId: string,
  repository: Pick<ArtifactRepository, "add"> = artifactRepository,
): Promise<ArtifactCaptureResult> {
  const results = await Promise.allSettled(
    files.map((file) =>
      Promise.resolve().then(() => repository.add(file, sessionId)),
    ),
  );
  const failures = new Set<ArtifactCaptureFailure>();
  let saved = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      saved += 1;
    } else if (result.reason instanceof ArtifactLibraryError) {
      failures.add(result.reason.code);
    } else {
      failures.add("write-failed");
    }
  }

  return { saved, failures: [...failures] };
}

export function getArtifactCaptureMessage(
  failure: ArtifactCaptureFailure,
  messages: ArtifactCaptureMessages,
): string {
  return messages[failure];
}

export function queueArtifactCapture(
  source: ArtifactCaptureSource,
  files: readonly File[],
  sessionId: string,
  onFailure: (failure: ArtifactCaptureFailure) => void,
  repository?: Pick<ArtifactRepository, "add">,
): void {
  if (source === "generated-long-text" || files.length === 0) return;

  void captureArtifacts(files, sessionId, repository).then(({ failures }) => {
    if (failures.length > 0) onFailure(failures[0]);
  });
}

export function queueSelectedArtifactCapture(
  source: ArtifactCaptureSource,
  selection: ArtifactCaptureSelection,
  sessionId: string,
  onFailure: (failure: ArtifactCaptureFailure) => void,
  repository?: Pick<ArtifactRepository, "add">,
): void {
  queueArtifactCapture(
    source,
    [...selection.selectedFiles, ...selection.selectedImageFiles],
    sessionId,
    onFailure,
    repository,
  );
}
