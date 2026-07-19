import type { ImprovementProposal } from "@workspace/db";
import { getDocsRoot } from "./docs";
import { resolve, relative } from "node:path";

const MANAGED_SECTION = "## Geleerde regels (uit reviews)";
export interface ChangeRequestResult { changed: boolean; verified: boolean; branch: string; pullRequestUrl: string; fileUrl: string; commitSha: string }
const config = () => { const token = process.env.GITHUB_TOKEN?.trim(); const repository = (process.env.GITHUB_REPOSITORY || "SaerensAdv/Attachment-Manager").trim(); const [owner, repo] = repository.split("/"); if (!token || !owner || !repo) throw new Error("GITHUB_CHANGE_REQUEST_NOT_CONFIGURED"); return { token, owner, repo, base: process.env.GITHUB_DEFAULT_BRANCH?.trim() || "main" }; };
async function request<T>(url: string, init: RequestInit = {}): Promise<T> { const { token } = config(); const response = await fetch(url, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...init.headers } }); if (!response.ok) { const detail = await response.text(); throw new Error(`GITHUB_${response.status}:${detail.slice(0, 240)}`); } return response.json() as Promise<T>; }
function repositoryPath(targetPath: string): string { const root = getDocsRoot(); const absolute = resolve(root, targetPath); const rel = relative(root, absolute).replaceAll("\\", "/"); if (rel.startsWith("../") || !rel.endsWith(".md")) throw new Error("INVALID_GITHUB_TARGET"); return rel; }
function appendRule(content: string, proposedText: string): { content: string; changed: boolean } { const bullet = `- ${proposedText.trim()}`; if (content.includes(bullet)) return { content, changed: false }; const trimmed = content.replace(/\s+$/, ""); return { content: trimmed.includes(MANAGED_SECTION) ? `${trimmed}\n${bullet}\n` : `${trimmed}\n\n${MANAGED_SECTION}\n\n${bullet}\n`, changed: true }; }
export async function createProposalPullRequest(proposal: ImprovementProposal): Promise<ChangeRequestResult> {
  if (proposal.targetType !== "knowledge") throw new Error("CLICKUP_OWNED_TARGET_REQUIRES_CLICKUP_DECISION");
  const { owner, repo, base } = config(); const path = repositoryPath(proposal.targetPath); const api = `https://api.github.com/repos/${owner}/${repo}`;
  const file = await request<{ sha: string; content: string; html_url: string }>(`${api}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}?ref=${encodeURIComponent(base)}`);
  const current = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8"); const next = appendRule(current, proposal.proposedText);
  if (!next.changed) return { changed: false, verified: true, branch: base, pullRequestUrl: file.html_url, fileUrl: file.html_url, commitSha: file.sha };
  const branch = `atlas/learning-proposal-${proposal.id}`; const baseRef = await request<{ object: { sha: string } }>(`${api}/git/ref/heads/${encodeURIComponent(base)}`);
  try { await request(`${api}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }) }); } catch (error) { if (!(error instanceof Error) || !error.message.startsWith("GITHUB_422")) throw error; }
  const commit = await request<{ commit: { sha: string }; content: { html_url: string } }>(`${api}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`, { method: "PUT", body: JSON.stringify({ message: `docs: stage learning proposal ${proposal.id}`, content: Buffer.from(next.content).toString("base64"), sha: file.sha, branch }) });
  const pr = await request<{ html_url: string }>(`${api}/pulls`, { method: "POST", body: JSON.stringify({ title: `Learning proposal #${proposal.id}: ${proposal.targetLabel}`, head: branch, base, body: `## Why\n${proposal.rationale}\n\n## Proposed rule\n${proposal.proposedText}\n\nSource Run: #${proposal.generationId}\n\nCreated by Workspace Atlas. Human merge required.` }) });
  return { changed: true, verified: Boolean(pr.html_url && commit.commit.sha), branch, pullRequestUrl: pr.html_url, fileUrl: commit.content.html_url, commitSha: commit.commit.sha };
}
export const testAppendRule = appendRule;
