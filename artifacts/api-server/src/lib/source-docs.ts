import { loadBrainHierarchy } from "./brain-hierarchy";
import { getDocFile, listDocFiles, type DocFile } from "./docs";
import { resolveBrainSource } from "./source-resolver";

export function resolveCompatibleSourcePath(input: string, extra: DocFile[] = []): string | null {
  const direct = getDocFile(input, extra);
  if (direct) return direct.path;
  const files = listDocFiles(extra);
  const hierarchy = loadBrainHierarchy(files.map((file) => file.path));
  return resolveBrainSource(input, hierarchy)?.canonicalPath ?? null;
}
export function getCompatibleDocFile(input: string, extra: DocFile[] = []): DocFile | null {
  const canonical = resolveCompatibleSourcePath(input, extra);
  return canonical ? getDocFile(canonical, extra) : null;
}
