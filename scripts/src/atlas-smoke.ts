import { createHmac } from "node:crypto";

const args = new Set(process.argv.slice(2));
const base = (process.env.ATLAS_BASE_URL ?? "").replace(/\/$/, "");
const token = (process.env.ATLAS_SESSION_TOKEN ?? "").trim();
const expectedSha = (process.env.ATLAS_EXPECTED_SHA ?? "").trim();
if (!base) throw new Error("ATLAS_BASE_URL is required");
const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { accept: "application/json", ...authHeaders, ...init.headers } });
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* retain text */ }
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  console.log(`ok ${path}`);
  return { body, headers: response.headers };
}

const publicHealth = await call("/api/healthz");
if ((publicHealth.body as { status?: string } | null)?.status !== "ok") throw new Error("healthz did not report ok");

const system = await call("/api/system/status");
const systemBody = system.body as { status?: string; provenance?: { gitSha?: string | null; deploymentMode?: string }; compatibility?: { status?: string }; checks?: Array<{ key?: string; status?: string }> };
if (!Array.isArray(systemBody.checks) || systemBody.checks.length === 0) throw new Error("system status returned no independent checks");
if (systemBody.status === "down") throw new Error("system status is down");
if (systemBody.compatibility?.status === "mismatch") throw new Error("frontend/API build mismatch");
if (expectedSha && systemBody.provenance?.gitSha !== expectedSha) throw new Error(`deployed SHA ${systemBody.provenance?.gitSha ?? "unknown"} does not match ${expectedSha}`);

await call("/api/operations/status");
const graph = await call("/api/graph/overview");
const graphBody = graph.body as { nodes?: unknown[]; edges?: unknown[]; meta?: { status?: string }; truncated?: boolean };
if (graphBody.meta?.status !== "active") throw new Error("graph has no active snapshot");
if (!graphBody.nodes?.length) throw new Error("graph overview contains no nodes");
if (graphBody.truncated !== true) throw new Error("production graph overview must be bounded/truncated");
await call("/api/graph/diagnostics");
await call("/api/graph/runtime-provenance");
await call("/api/clickup/companies/sync-status");
await call("/api/clickup/companies");

if (args.has("--companies-sync")) {
  if (process.env.ATLAS_CONFIRM_COMPANIES_SYNC !== "SYNC_CLICKUP_COMPANIES") throw new Error("Set ATLAS_CONFIRM_COMPANIES_SYNC=SYNC_CLICKUP_COMPANIES to run the controlled cache sync");
  await call("/api/clickup/companies/sync", { method: "POST" });
}
if (args.has("--webhook-signature-smoke")) {
  const secret = (process.env.CLICKUP_WEBHOOK_SECRET ?? "").trim();
  if (!secret) throw new Error("CLICKUP_WEBHOOK_SECRET is required for signature smoke");
  const payload = JSON.stringify({ event: "taskUpdated", webhook_id: "atlas-release-smoke", task_id: "nonexistent-smoke-task", team_id: "denied-workspace", history_items: [{ id: `smoke-${Date.now()}`, field: "status", date: String(Date.now()), user: { id: 0 }, before: { status: "review" }, after: { status: "approved" } }] });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  await call("/api/webhooks/clickup", { method: "POST", headers: { "content-type": "application/json", "x-signature": signature }, body: payload });
}
console.log("Atlas production smoke checks complete");
