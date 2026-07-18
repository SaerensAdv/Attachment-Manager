import type { BrainHierarchyNode } from "@workspace/api-client-react";

export interface KnowledgeTreeNode extends BrainHierarchyNode { children: KnowledgeTreeNode[] }
export function buildKnowledgeTree(nodes: readonly BrainHierarchyNode[], rootId: string): KnowledgeTreeNode | null {
  const byId = new Map(nodes.map((node) => [node.id, { ...node, children: [] as KnowledgeTreeNode[] }]));
  for (const node of byId.values()) if (node.parent && byId.has(node.parent)) byId.get(node.parent)!.children.push(node);
  for (const node of byId.values()) node.children.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return byId.get(rootId) ?? null;
}
export function hierarchyBreadcrumbs(nodes: readonly BrainHierarchyNode[], id: string): BrainHierarchyNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: BrainHierarchyNode[] = []; const seen = new Set<string>(); let current = byId.get(id);
  while (current && !seen.has(current.id)) { path.unshift(current); seen.add(current.id); current = current.parent ? byId.get(current.parent) : undefined; }
  return path;
}
export function hierarchySourceId(nodes: readonly BrainHierarchyNode[], runtimeId: string): string | null { return nodes.find((node) => node.runtimeId === runtimeId || node.source === runtimeId)?.id ?? null; }
export function hierarchyRuntimeId(nodes: readonly BrainHierarchyNode[], hierarchyId: string): string | null { const node = nodes.find((candidate) => candidate.id === hierarchyId); return node?.runtimeId ?? node?.source ?? null; }
export function filterHierarchyTree(node: KnowledgeTreeNode, query: string): KnowledgeTreeNode | null {
  const term = query.trim().toLowerCase(); if (!term) return node;
  const children = node.children.map((child) => filterHierarchyTree(child, term)).filter((child): child is KnowledgeTreeNode => Boolean(child));
  const matches = node.label.toLowerCase().includes(term) || node.source?.toLowerCase().includes(term) || node.canonicalOwner.includes(term);
  return matches || children.length ? { ...node, children } : null;
}
