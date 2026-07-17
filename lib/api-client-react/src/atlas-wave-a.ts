import { customFetch } from "./custom-fetch";

export type AtlasSectionStatus = "ok" | "unavailable";
export interface AtlasTodoSection {
  status: AtlasSectionStatus;
  count: number;
  errorCode: string | null;
}

export interface AtlasTodoResponse {
  pendingProposals: unknown[];
  pendingApprovals: Array<{
    generationId: number;
    clientName: string | null;
    workflowTitle: string;
    kind: string | null;
    createdAt: string;
  }>;
  unresolvedAlerts: unknown[];
  sections: {
    pendingProposals: AtlasTodoSection;
    pendingApprovals: AtlasTodoSection;
    unresolvedAlerts: AtlasTodoSection;
  };
  partial: boolean;
}

export type AgentLifecycle = "active" | "paused" | "deprecated";
export interface AtlasTeamMember {
  slug: string;
  path: string;
  title: string;
  name: string | null;
  active: boolean;
  lifecycle: AgentLifecycle;
  pausedAt: string | null;
  reason: string | null;
  [key: string]: unknown;
}

export interface AtlasTeamResponse {
  employees: AtlasTeamMember[];
  departments: unknown[];
}

export interface AtlasKnowledgeRelation {
  source: string;
  target: string;
  kind: "reference" | "routing" | "flow" | "mention";
}

export interface AtlasKnowledgeItem {
  nodeId: string;
  path: string;
  title: string;
  category: string;
  content: string;
  source: "github" | "replit-cache";
  canonicalUrl: string | null;
  updatedAt: string | null;
  editable: false;
  active: boolean;
  relations: AtlasKnowledgeRelation[];
}

/** Additive Wave A clients, usable before the next full Orval regeneration. */
export const getAtlasTodo = (signal?: AbortSignal) =>
  customFetch<AtlasTodoResponse>("/api/todo", {
    method: "GET",
    responseType: "json",
    signal,
  });

export const getAtlasTeam = (signal?: AbortSignal) =>
  customFetch<AtlasTeamResponse>("/api/team", {
    method: "GET",
    responseType: "json",
    signal,
  });

export const getAtlasKnowledgeItem = (nodeId: string, signal?: AbortSignal) =>
  customFetch<AtlasKnowledgeItem>(
    `/api/knowledge/item?nodeId=${encodeURIComponent(nodeId)}`,
    { method: "GET", responseType: "json", signal },
  );
