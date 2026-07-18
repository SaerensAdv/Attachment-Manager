import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { findBrainHierarchyRoot } from "./brain-hierarchy";
import type { DocFile } from "./docs";

const baselineSchema = z.object({ version: z.literal(1), gitSha: z.string().min(7), capturedAt: z.string().min(1), counts: z.record(z.string(), z.number().int().nonnegative()), note: z.string().optional() });
export type SourceBaseline = z.infer<typeof baselineSchema>;
export interface SourceInventory { baseline: SourceBaseline; counts: Record<string, number>; total: number; contentHash: string; files: Array<{ path: string; category: string; contentHash: string }>; drift: string[] }

export function loadSourceBaseline(start = process.cwd()): SourceBaseline {
  const root = findBrainHierarchyRoot(start);
  const path = join(root, "brain-source-baseline.json");
  if (!existsSync(path)) throw new Error("Could not locate brain-source-baseline.json");
  return baselineSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
export function buildSourceInventory(files: readonly DocFile[], baseline = loadSourceBaseline()): SourceInventory {
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const counts: Record<string, number> = {};
  const aggregate = createHash("sha256");
  const entries = ordered.map((file) => {
    counts[file.category] = (counts[file.category] ?? 0) + 1;
    const contentHash = createHash("sha256").update(file.content).digest("hex");
    aggregate.update(file.path).update("\0").update(contentHash).update("\0");
    return { path: file.path, category: file.category, contentHash };
  });
  const total = entries.length;
  const drift: string[] = [];
  for (const [category, expected] of Object.entries(baseline.counts)) {
    const actual = category === "total" ? total : counts[category] ?? 0;
    if (actual !== expected) drift.push(`${category}:${expected}->${actual}`);
  }
  return { baseline, counts, total, contentHash: aggregate.digest("hex"), files: entries, drift };
}
