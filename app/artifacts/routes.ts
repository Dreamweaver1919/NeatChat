import { Path } from "../constant";

export function isSharedArtifactPath(pathname: string) {
  return pathname.startsWith(Path.Artifacts + "/");
}
