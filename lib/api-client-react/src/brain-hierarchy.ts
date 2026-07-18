import { customFetch } from "./custom-fetch";

export type BrainHierarchyKind = "master" | "hub" | "registry" | "object" | "source" | "runtime";
export type BrainHierarchyOwner = "clickup" | "github" | "replit" | "mixed";
export interface BrainHierarchyNode {
  id: string;
  kind: BrainHierarchyKind;
  label: string;
  parent: string | null;
  order: number;
  canonicalOwner: BrainHierarchyOwner;
  status: "active" | "paused" | "deprecated" | "archived";
  visibility: "default" | "advanced" | "hidden";
  aliases?: string[];
  source?: string;
  runtimeId?: string;
}
export interface BrainHierarchyIssue { code: string; message: string; nodeId?: string; source?: string }
export interface BrainHierarchyResponse { manifest: { version: number; rootId: string }; nodes: BrainHierarchyNode[]; issues: BrainHierarchyIssue[]; sourceCount: number; mappedSourceCount: number }
export function getBrainHierarchy(signal?: AbortSignal): Promise<BrainHierarchyResponse> {
  return customFetch<BrainHierarchyResponse>("/api/docs/hierarchy", { signal, responseType: "json" });
}
