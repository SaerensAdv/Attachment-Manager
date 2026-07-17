import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DocEdge, DocFile } from "./docs";
import { getDocsRoot } from "./docs";

export type KnowledgeSource = "github" | "replit-cache";

export interface KnowledgeItem {
  nodeId: string;
  path: string;
  title: string;
  category: string;
  content: string;
  source: KnowledgeSource;
  canonicalUrl: string | null;
  updatedAt: string | null;
  editable: false;
  active: boolean;
  relations: DocEdge[];
}

function githubBase(): string {
  return (
    process.env.GITHUB_REPOSITORY_URL?.replace(/\/$/, "") ||
    "https://github.com/SaerensAdv/Attachment-Manager"
  );
}

function onDiskUpdatedAt(path: string): string | null {
  try {
    const absolute = join(getDocsRoot(), path);
    if (!existsSync(absolute)) return null;
    return statSync(absolute).mtime.toISOString();
  } catch {
    return null;
  }
}

export function buildKnowledgeItem(
  file: DocFile,
  relations: DocEdge[],
): KnowledgeItem {
  const synthetic = file.path.startsWith("clients/db/");
  return {
    nodeId: file.id,
    path: file.path,
    title: file.title,
    category: file.category,
    content: file.content,
    source: synthetic ? "replit-cache" : "github",
    canonicalUrl: synthetic
      ? null
      : `${githubBase()}/blob/main/${encodeURI(file.path)}`,
    updatedAt: synthetic ? null : onDiskUpdatedAt(file.path),
    // Atlas v1 treats GitHub/runtime knowledge as read-only. Editing must move
    // through a reviewed Git branch/PR rather than silent runtime file writes.
    editable: false,
    active: file.active,
    relations,
  };
}
