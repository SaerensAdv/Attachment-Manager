import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetGenerationQueryKey,
  getGetGenerationsQueryKey,
  getGetGenerationStepsQueryKey,
  getGetProposalsQueryKey,
  useAcceptProposal,
  useApproveGeneration,
  useCreateProposals,
  useDeleteGeneration,
  useGetGeneration,
  useGetGenerations,
  useGetGenerationSteps,
  useGetProposals,
  useRejectProposal,
  useRequestGenerationChanges,
  useSetGenerationFeedback,
  type GenerationStep,
  type GenerationSummary,
  type ImprovementProposal,
} from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Clipboard, Clock3,
  Copy, Crown, Download, Eye, FileText, GitPullRequestArrow, Loader2, MailCheck,
  Package, Radio, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, Trash2, User, X,
} from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import "./Runs.css";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-BE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const duration = (ms: number | null) => ms == null ? "Unknown" : ms < 60_000 ? `${Math.round(ms / 1000)} sec` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} sec`;
const tokens = (value: number | null) => value == null ? "Unknown" : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
const snippet = (value: string, max = 120) => { const clean = value.replace(/\s+/g, " ").trim(); return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean; };
const errorDetail = (error: unknown) => { if (error && typeof error === "object") { const data = (error as { data?: Record<string, unknown> }).data; if (typeof data?.detail === "string") return data.detail; if (typeof data?.error === "string") return data.error; if (typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message; } return "The action failed. Nothing was changed."; };
const roleIcon = (role: string) => role === "lead" ? Crown : role === "deliverable" ? Package : User;

function Approval({ run, refresh }: { run: NonNullable<ReturnType<typeof useGetGeneration>["data"]>; refresh: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const approve = useApproveGeneration();
  const changes = useRequestGenerationChanges();
  const busy = approve.isPending || changes.isPending;
  if (!run.approvalStatus) return null;
  if (run.approvalStatus === "approved") return <section className="runs-approval is-resolved"><CheckCircle2 /><span><small>Approval resolved</small><h3>Gmail draft created</h3><p>The draft is waiting in Gmail for a final check and manual send.</p></span></section>;
  if (run.approvalStatus === "changes_requested") return <section className="runs-approval is-changes"><AlertTriangle /><span><small>Changes requested</small><h3>Delivery remains blocked</h3><p>{run.approvalNote || "No reviewer note was recorded."}</p></span></section>;
  const email = run.pendingEmailReply;
  const handleApprove = async () => { setError(null); try { await approve.mutateAsync({ id: run.id }); refresh(); } catch (err) { setError(errorDetail(err)); } };
  const handleChanges = async () => { setError(null); try { await changes.mutateAsync({ id: run.id, data: { note: note.trim() || null } }); refresh(); } catch (err) { setError(errorDetail(err)); } };
  return <section className="runs-approval is-pending"><MailCheck /><div><small>Human checkpoint</small><h3>Approve and create Gmail draft</h3><p>This does not send email. It creates a reviewable Gmail draft from the held snapshot.</p>
    {email && <div className="runs-email-review"><article><small>Client message</small><b>{email.subject}</b><p>{email.inboundText}</p></article><article><small>Proposed reply</small><b>To {email.recipient}</b><p>{email.replyBody}</p></article></div>}
    <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional: describe the required changes" />
    {error && <p className="runs-action-error"><AlertTriangle />{error}</p>}
    <div className="runs-actions"><button type="button" className="is-primary" disabled={busy} onClick={handleApprove}>{approve.isPending ? <Loader2 className="atlas-rotating" /> : <FileText />}Create Gmail draft</button><button type="button" disabled={busy} onClick={handleChanges}>{changes.isPending ? <Loader2 className="atlas-rotating" /> : <ThumbsDown />}Request changes</button></div>
  </div></section>;
}

function AuditTrail({ steps }: { steps: GenerationStep[] }) {
  if (!steps.length) return <div className="runs-inline-empty">No agent steps were recorded for this run.</div>;
  return <ol className="runs-timeline">{steps.map((step) => { const Icon = roleIcon(step.role); return <li key={step.id} data-status={step.status}><i><Icon /></i><div><header><b>{step.agentTitle}</b><span>{step.role}</span><em>{step.status}</em></header><p>{duration(step.durationMs)} · {tokens(step.outputTokens)} output tokens{step.charCount != null ? ` · ${step.charCount.toLocaleString("en-BE")} chars` : ""}</p>{step.errorMessage && <aside><AlertTriangle />{step.errorMessage}</aside>}{step.handoffBrief && <details><summary>Handoff brief</summary><pre>{JSON.stringify(step.handoffBrief, null, 2)}</pre></details>}</div></li>; })}</ol>;
}

function Learning({ runId, verdict: savedVerdict, note: savedNote }: { runId: number; verdict: string | null; note: string | null }) {
  const client = useQueryClient();
  const [verdict, setVerdict] = useState<"approved" | "rejected" | null>((savedVerdict as "approved" | "rejected" | null) ?? null);
  const [note, setNote] = useState(savedNote ?? "");
  const [confirm, setConfirm] = useState<number | null>(null);
  const [result, setResult] = useState<{ id: number; changed: boolean; verified: boolean } | null>(null);
  useEffect(() => { setVerdict((savedVerdict as "approved" | "rejected" | null) ?? null); setNote(savedNote ?? ""); setConfirm(null); setResult(null); }, [runId, savedVerdict, savedNote]);
  const proposals = useGetProposals(runId, { query: { queryKey: getGetProposalsQueryKey(runId) } });
  const feedback = useSetGenerationFeedback(); const create = useCreateProposals(); const accept = useAcceptProposal(); const reject = useRejectProposal();
  const invalidate = () => client.invalidateQueries({ queryKey: getGetProposalsQueryKey(runId) });
  const save = async () => { if (!verdict) return; await feedback.mutateAsync({ id: runId, data: { verdict, note: note.trim() || null } }); await client.invalidateQueries({ queryKey: getGetGenerationQueryKey(runId) }); };
  const apply = async (id: number) => { setResult(null); const data = await accept.mutateAsync({ id }); setResult({ id, changed: data.changed, verified: data.verified }); setConfirm(null); await invalidate(); };
  return <section className="runs-learning"><header><div><small>Human feedback</small><h3>Quality and learning</h3></div><span>Every source change requires confirmation</span></header>
    <div className="runs-verdict"><button type="button" className={verdict === "approved" ? "is-active" : ""} onClick={() => setVerdict("approved")}><ThumbsUp />Approved</button><button type="button" className={verdict === "rejected" ? "is-active is-negative" : ""} onClick={() => setVerdict("rejected")}><ThumbsDown />Rejected</button></div>
    <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Concrete correction or preference" />
    <div className="runs-actions"><button type="button" className="is-primary" disabled={!verdict || feedback.isPending} onClick={() => void save()}>{feedback.isPending ? <Loader2 className="atlas-rotating" /> : <Check />}Save verdict</button><button type="button" disabled={!savedVerdict || create.isPending} onClick={() => create.mutate({ id: runId }, { onSuccess: invalidate })}>{create.isPending ? <Loader2 className="atlas-rotating" /> : <Sparkles />}Generate proposals</button></div>
    {(feedback.isError || create.isError) && <p className="runs-action-error"><AlertTriangle />{errorDetail(feedback.error || create.error)}</p>}
    <div className="runs-proposals">{proposals.isLoading && <Loader2 className="atlas-rotating" />}{proposals.data?.proposals.map((proposal: ImprovementProposal) => <article key={proposal.id} data-status={proposal.status}><header><span>{proposal.targetType}</span><b>{proposal.targetLabel}</b><em>{proposal.status}</em></header><p>{proposal.rationale}</p><pre>{proposal.proposedText}</pre>
      {proposal.status === "pending" && (confirm === proposal.id ? <div className="runs-confirm"><AlertTriangle /><span><b>Apply this exact rule?</b><small>This changes the canonical source and cannot be treated optimistically.</small></span><button type="button" disabled={accept.isPending} onClick={() => void apply(proposal.id)}>{accept.isPending ? <Loader2 className="atlas-rotating" /> : <Check />}Confirm apply</button><button type="button" onClick={() => setConfirm(null)}>Cancel</button></div> : <div className="runs-actions"><button type="button" onClick={() => setConfirm(proposal.id)}><GitPullRequestArrow />Review apply</button><button type="button" disabled={reject.isPending} onClick={() => reject.mutate({ id: proposal.id }, { onSuccess: invalidate })}><X />Reject</button></div>)}
      {result?.id === proposal.id && <p className={result.verified ? "runs-verified" : "runs-warning"}><Check />{result.changed ? "Rule added" : "Rule already existed"}. {result.verified ? "Verified in source." : "Could not verify automatically, check the source."}</p>}
      {((accept.isError && accept.variables?.id === proposal.id) || (reject.isError && reject.variables?.id === proposal.id)) && <p className="runs-action-error"><AlertTriangle />{errorDetail(accept.error || reject.error)}</p>}
    </article>)}</div>
  </section>;
}

export default function Runs() {
  const queryClient = useQueryClient(); const search = useSearch();
  const [selected, setSelected] = useState<number | null>(() => { const value = Number(new URLSearchParams(search).get("id")); return Number.isFinite(value) && value > 0 ? value : null; });
  const [tab, setTab] = useState<"output" | "audit" | "learning">("output");
  const [confirmDelete, setConfirmDelete] = useState(false); const [copied, setCopied] = useState(false);
  const list = useGetGenerations(); const runs: GenerationSummary[] = list.data?.generations ?? [];
  const detail = useGetGeneration(selected ?? 0, { query: { enabled: selected !== null, queryKey: getGetGenerationQueryKey(selected ?? 0) } });
  const steps = useGetGenerationSteps(selected ?? 0, { query: { enabled: selected !== null, queryKey: getGetGenerationStepsQueryKey(selected ?? 0) } });
  const remove = useDeleteGeneration(); const markdown = detail.data?.finalMarkdown ?? "";
  const refreshRun = () => { if (selected == null) return; void queryClient.invalidateQueries({ queryKey: getGetGenerationQueryKey(selected) }); void queryClient.invalidateQueries({ queryKey: getGetGenerationStepsQueryKey(selected) }); void queryClient.invalidateQueries({ queryKey: getGetGenerationsQueryKey() }); };
  const open = (id: number) => { setSelected(id); setTab("output"); setConfirmDelete(false); history.replaceState(null, "", `${location.pathname}?id=${id}`); };
  const close = () => { setSelected(null); setConfirmDelete(false); history.replaceState(null, "", location.pathname); };
  const copy = async () => { await navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  const download = () => { const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${(detail.data?.clientName ?? "run").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${selected}.md`; anchor.click(); URL.revokeObjectURL(url); };
  const deleteRun = () => { if (selected == null) return; remove.mutate({ id: selected }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetGenerationsQueryKey() }); close(); } }); };
  const actions = <button type="button" className="atlas-action" onClick={() => { void list.refetch(); refreshRun(); }} disabled={list.isFetching}><RefreshCw className={list.isFetching ? "atlas-rotating" : ""} />Refresh</button>;

  return <AtlasShell title="Runs" subtitle="Execution history, approvals and learning" actions={actions}><main className="runs-stage">
    <aside className={`runs-index${selected ? " has-selection" : ""}`} data-lenis-prevent><header><div><p>Run archive</p><h2>{runs.length} executions</h2></div></header>
      {list.isLoading && <div className="runs-index-state"><Loader2 className="atlas-rotating" />Loading runs</div>}{list.isError && <div className="runs-index-state is-error"><AlertTriangle />Archive unavailable<button onClick={() => list.refetch()}>Try again</button></div>}
      {!list.isLoading && !list.isError && !runs.length && <div className="runs-index-state"><Clipboard />No runs archived yet</div>}
      <div className="runs-list">{runs.map((run) => <button key={run.id} type="button" className={selected === run.id ? "is-active" : ""} onClick={() => open(run.id)}><i data-status={run.status} /><span><b>{run.clientName}</b><small>{run.workflowTitle} · {formatDate(run.createdAt)}</small><p>{snippet(run.requestText)}</p></span><ChevronRight /></button>)}</div>
    </aside>
    <section className={`runs-inspector${selected ? " is-open" : ""}`} data-lenis-prevent>
      {selected == null && <div className="runs-no-selection"><Radio /><h2>Select a run</h2><p>Inspect output, every agent handoff, approval state and proposed learning changes.</p></div>}
      {selected != null && detail.isLoading && <div className="runs-no-selection"><Loader2 className="atlas-rotating" />Loading run</div>}
      {selected != null && detail.isError && <div className="runs-no-selection is-error"><AlertTriangle /><h2>Run unavailable</h2><button onClick={() => detail.refetch()}>Try again</button></div>}
      {detail.data && <><header className="runs-detail-head"><button type="button" className="runs-back" onClick={close}><ArrowLeft />Back</button><div><p>Run #{detail.data.id} · {formatDate(detail.data.createdAt)}</p><h2>{detail.data.clientName}</h2><span>{detail.data.teamTitles.join(" → ")}</span></div><div className="runs-head-actions"><button type="button" onClick={() => void copy()} disabled={!markdown}>{copied ? <Check /> : <Copy />}</button><button type="button" onClick={download} disabled={!markdown}><Download /></button><button type="button" onClick={close}><X /></button></div></header>
        <div className="runs-meta"><span data-status={detail.data.status}>{detail.data.status}</span><span><Clock3 />{duration(detail.data.durationMs)}</span><span>{tokens(detail.data.totalTokens)} tokens</span>{detail.data.clientFacing && <span><Eye />Client-facing</span>}{detail.data.touchesLiveAccount && <span><Radio />Live account</span>}</div>
        <nav className="runs-tabs">{(["output", "audit", "learning"] as const).map((value) => <button key={value} type="button" className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{value}{value === "audit" && steps.data ? ` · ${steps.data.steps.length}` : ""}</button>)}</nav>
        <div className="runs-detail-body">
          {tab === "output" && <><section className="runs-brief"><small>Original request</small><p>{detail.data.requestText}</p></section>{detail.data.fanoutCandidates?.candidates.length ? <section className="runs-fanout"><small>Candidate selection</small><h3>{detail.data.fanoutCandidates.candidates.length} variants evaluated</h3>{detail.data.fanoutCandidates.rationale && <p>{detail.data.fanoutCandidates.rationale}</p>}{detail.data.fanoutCandidates.candidates.map((candidate) => <details key={candidate.variant} open={candidate.winner}><summary>Variant {candidate.variant} {candidate.winner ? "· Winner" : `· ${candidate.reason ?? "Not selected"}`}</summary><ReactMarkdown remarkPlugins={[remarkGfm]}>{candidate.text}</ReactMarkdown></details>)}</section> : null}<article className="runs-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></article><Approval run={detail.data} refresh={refreshRun} /></>}
          {tab === "audit" && <AuditTrail steps={steps.data?.steps ?? []} />}
          {tab === "learning" && <Learning runId={detail.data.id} verdict={detail.data.feedbackVerdict} note={detail.data.feedbackNote} />}
          <footer className="runs-delete">{confirmDelete ? <><span>Delete run #{detail.data.id} permanently?</span><button type="button" className="is-danger" disabled={remove.isPending} onClick={deleteRun}>{remove.isPending ? <Loader2 className="atlas-rotating" /> : <Trash2 />}Confirm delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></> : <button type="button" onClick={() => setConfirmDelete(true)}><Trash2 />Delete run</button>}</footer>
        </div></>}
    </section>
  </main></AtlasShell>;
}
