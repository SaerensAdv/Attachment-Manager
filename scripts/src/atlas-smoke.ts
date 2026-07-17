import { createHmac } from "node:crypto";

const args = new Set(process.argv.slice(2));
const base = (process.env.ATLAS_BASE_URL ?? "").replace(/\/$/, "");
const token = (process.env.ATLAS_SESSION_TOKEN ?? "").trim();
if (!base) throw new Error("ATLAS_BASE_URL is required");
const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { accept: "application/json", ...authHeaders, ...init.headers } });
  const text = await response.text();
  let body: unknown = text; try { body = text ? JSON.parse(text) : null; } catch { /* retain text */ }
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  console.log(`ok ${path}`); return body;
}
await call("/api/system/status");
await call("/api/operations/status");
await call("/api/clickup/companies/sync-status");
await call("/api/clickup/companies");
if (args.has("--companies-sync")) {
  if (process.env.ATLAS_CONFIRM_COMPANIES_SYNC !== "SYNC_CLICKUP_COMPANIES") throw new Error("Set ATLAS_CONFIRM_COMPANIES_SYNC=SYNC_CLICKUP_COMPANIES to run the controlled write-to-cache sync");
  await call("/api/clickup/companies/sync", { method: "POST" });
}
if (args.has("--webhook-signature-smoke")) {
  const secret = (process.env.CLICKUP_WEBHOOK_SECRET ?? "").trim();
  if (!secret) throw new Error("CLICKUP_WEBHOOK_SECRET is required for signature smoke");
  const payload = JSON.stringify({ event: "taskUpdated", webhook_id: "atlas-wave-e-smoke", task_id: "nonexistent-smoke-task", team_id: "wave-e-denied-workspace", history_items: [{ id: `smoke-${Date.now()}`, field: "status", date: String(Date.now()), user: { id: 0 }, before: { status: "review" }, after: { status: "approved" } }] });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  await call("/api/webhooks/clickup", { method: "POST", headers: { "content-type": "application/json", "x-signature": signature }, body: payload });
  console.log("signature accepted; denied workspace guarantees no task lookup or Gmail action");
}
console.log("Atlas Wave E smoke checks complete");
