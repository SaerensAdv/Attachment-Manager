import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  getAtlasClickUpPushes,
  getAtlasOperationsStatus,
  getGetAlertsQueryKey,
  getGetTodoOverviewQueryKey,
  requeueAtlasClickUpPush,
  useGetTodoOverview,
  useResolveAlert,
  type ClickUpPushRecord,
  type ImprovementProposal,
  type PendingApproval,
  type SystemAlert,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FileWarning,
  GitPullRequestArrow,
  Loader2,
  MailCheck,
  RefreshCw,
  RotateCcw,
  ServerCog,
  Sparkles,
  Webhook,
} from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import "./Operations.css";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
};

const kindLabel = (kind: string | null) => ({
  "monthly-report-email": "Monthly report email",
  "email-reply": "Email reply",
  website: "Website",
  "slide-deck": "Slide deck",
  "google-ads-csv": "Google Ads CSV",
}[kind ?? ""] ?? kind ?? "Deliverable");

function QueueRow({ icon, eyebrow, title, detail, href, tone = "neutral" }: { icon: React.ReactNode; eyebrow: string; title: string; detail: string; href: string; tone?: "neutral" | "attention" | "danger" }) {
  return <Link href={href} className="operations-queue-row" data-tone={tone}>
    <i>{icon}</i><span><small>{eyebrow}</small><b>{title}</b><p>{detail}</p></span><ArrowUpRight />
  </Link>;
}

function StatusLine({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone: "healthy" | "attention" | "danger" | "unknown" }) {
  return <div className="operations-status-line" data-tone={tone}>
    <i>{icon}</i><span><small>{label}</small><b>{value}</b><p>{detail}</p></span>
  </div>;
}

function PushRow({ record, onRetry, pending }: { record: ClickUpPushRecord; onRetry: (id: number) => void; pending: boolean }) {
  const retryable = record.status === "retrying" || record.status === "failed";
  return <div className="operations-push-row">
    <span><b>{record.kind.replaceAll("-", " ")}</b><small>{record.status} · {record.attempts} attempt{record.attempts === 1 ? "" : "s"}</small></span>
    <time>{formatDate(record.updatedAt)}</time>
    {record.clickupUrl && <a href={record.clickupUrl} target="_blank" rel="noreferrer" aria-label="Open ClickUp object"><ArrowUpRight /></a>}
    {retryable && <button type="button" onClick={() => onRetry(record.id)} disabled={pending}>{pending ? <Loader2 className="atlas-rotating" /> : <RotateCcw />}Retry</button>}
  </div>;
}

export default function Operations() {
  const queryClient = useQueryClient();
  const todo = useGetTodoOverview();
  const status = useQuery({ queryKey: ["atlas-operations-status"], queryFn: ({ signal }) => getAtlasOperationsStatus(signal), refetchInterval: 30_000 });
  const pushes = useQuery({ queryKey: ["atlas-clickup-pushes", "exceptions"], queryFn: ({ signal }) => getAtlasClickUpPushes({ limit: 20 }, signal) });
  const resolveAlert = useResolveAlert();
  const retryPush = useMutation({ mutationFn: (id: number) => requeueAtlasClickUpPush(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["atlas-clickup-pushes"] }); queryClient.invalidateQueries({ queryKey: ["atlas-operations-status"] }); } });

  const alerts = todo.data?.unresolvedAlerts ?? [];
  const approvals = todo.data?.pendingApprovals ?? [];
  const proposals = todo.data?.pendingProposals ?? [];
  const queueTotal = alerts.length + approvals.length + proposals.length;
  const exceptionalPushes = (pushes.data?.records ?? []).filter((record) => ["retrying", "failed", "dead_letter"].includes(record.status));
  const operations = status.data;
  const refresh = () => { void todo.refetch(); void status.refetch(); void pushes.refetch(); };
  const resolving = (id: number) => resolveAlert.isPending && resolveAlert.variables?.id === id;
  const handleResolve = (id: number) => resolveAlert.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetTodoOverviewQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() }); queryClient.invalidateQueries({ queryKey: ["atlas-operations-status"] }); } });

  const actions = <button type="button" className="atlas-action" onClick={refresh} disabled={todo.isFetching || status.isFetching}><RefreshCw className={todo.isFetching || status.isFetching ? "atlas-rotating" : ""} />Refresh</button>;

  return <AtlasShell title="Operations" subtitle="Decisions, exceptions and delivery control" actions={actions}>
    <main className="operations-stage" data-lenis-prevent>
      <section className="operations-primary">
        <header className="operations-intro"><div><p>Attention queue</p><h2>{queueTotal === 0 ? "Clear runway" : `${queueTotal} item${queueTotal === 1 ? "" : "s"} need you`}</h2></div><span data-clear={queueTotal === 0}>{queueTotal === 0 ? <CheckCircle2 /> : <BellRing />}{queueTotal === 0 ? "All clear" : "Action required"}</span></header>
        {(todo.isLoading || status.isLoading) && <div className="operations-skeleton"><span /><span /><span /></div>}
        {todo.isError && <div className="operations-error"><AlertTriangle /><span><b>Attention queue unavailable</b><p>The system did not treat this as an empty queue. Retry before making operational decisions.</p></span><button type="button" onClick={() => todo.refetch()}>Try again</button></div>}
        {!todo.isLoading && !todo.isError && queueTotal === 0 && <div className="operations-empty"><CheckCircle2 /><h3>No approvals, alerts or proposals waiting</h3><p>New exceptions will appear here automatically. Health signals remain visible at the right.</p></div>}
        {alerts.length > 0 && <div className="operations-group"><h3><AlertTriangle />Alerts <span>{alerts.length}</span></h3>{alerts.map((alert: SystemAlert) => <div className="operations-alert-row" key={alert.id} data-severity={alert.severity}><i><AlertTriangle /></i><span><small>{alert.source} · {alert.occurrences} occurrence{alert.occurrences === 1 ? "" : "s"}</small><b>{alert.message}</b><p>Last seen {formatDate(alert.lastSeenAt)}</p></span><button type="button" onClick={() => handleResolve(alert.id)} disabled={resolving(alert.id)}>{resolving(alert.id) ? <Loader2 className="atlas-rotating" /> : <Check />}Resolve</button></div>)}</div>}
        {approvals.length > 0 && <div className="operations-group"><h3><MailCheck />Approvals <span>{approvals.length}</span></h3>{approvals.map((approval: PendingApproval) => <QueueRow key={approval.generationId} icon={<MailCheck />} eyebrow={`${kindLabel(approval.kind)} · ${formatDate(approval.createdAt)}`} title={approval.clientName ?? "Internal delivery"} detail={`${approval.workflowTitle}. Review creates a Gmail draft, it does not send email.`} href={`/history?id=${approval.generationId}`} tone="attention" />)}</div>}
        {proposals.length > 0 && <div className="operations-group"><h3><Sparkles />Learning proposals <span>{proposals.length}</span></h3>{proposals.map((proposal: ImprovementProposal) => <QueueRow key={proposal.id} icon={<GitPullRequestArrow />} eyebrow={proposal.targetType === "client" ? "Client rule" : "Operating standard"} title={proposal.targetLabel} detail={proposal.rationale} href={`/history?id=${proposal.generationId}`} />)}</div>}
      </section>

      <aside className="operations-sidebar">
        <section><header><p>Runtime exceptions</p><h2>Flow control</h2></header>
          {status.isError ? <div className="operations-mini-error"><AlertTriangle />Status unavailable</div> : <div className="operations-status-list">
            <StatusLine icon={<DatabaseZap />} label="Push queue" value={(operations?.pushQueue.retrying ?? 0) + (operations?.pushQueue.deadLetters ?? operations?.pushQueue.failed ?? 0)} detail={`${operations?.pushQueue.pending ?? operations?.pushQueue.queued ?? 0} pending`} tone={(operations?.pushQueue.deadLetters ?? operations?.pushQueue.failed ?? 0) > 0 ? "danger" : (operations?.pushQueue.retrying ?? 0) > 0 ? "attention" : "healthy"} />
            <StatusLine icon={<Webhook />} label="ClickUp webhook" value={operations?.webhook.registered ? "Registered" : "Not registered"} detail={`${operations?.webhook.deadLetters ?? 0} dead letters · ${formatDate(operations?.webhook.lastEventAt)}`} tone={(operations?.webhook.deadLetters ?? 0) > 0 ? "danger" : operations?.webhook.registered ? "healthy" : "unknown"} />
            <StatusLine icon={<Clock3 />} label="Scheduler" value={operations?.scheduler.status ?? "Unknown"} detail={`${operations?.scheduler.enabledSchedules ?? 0} enabled · next ${formatDate(operations?.scheduler.nextRunAt)}`} tone={operations?.scheduler.status === "healthy" ? "healthy" : operations?.scheduler.status === "degraded" ? "attention" : "unknown"} />
            <StatusLine icon={<ServerCog />} label="Workspace graph" value={operations?.graph.syncing ? "Syncing" : "Idle"} detail={`Last sync ${formatDate(operations?.graph.lastSyncedAt)}`} tone={operations?.graph.syncing ? "attention" : "healthy"} />
          </div>}
        </section>
        <section className="operations-pushes"><header><p>ClickUp delivery</p><h2>Retry queue</h2></header>
          {pushes.isLoading && <div className="operations-mini-loading"><Loader2 className="atlas-rotating" />Loading delivery records</div>}
          {pushes.isError && <div className="operations-mini-error"><FileWarning />Delivery history unavailable</div>}
          {!pushes.isLoading && !pushes.isError && exceptionalPushes.length === 0 && <div className="operations-push-clear"><CheckCircle2 /><span><b>No failed pushes</b><small>Recent deliveries are clear</small></span></div>}
          {exceptionalPushes.slice(0, 8).map((record) => <PushRow key={record.id} record={record} onRetry={(id) => retryPush.mutate(id)} pending={retryPush.isPending && retryPush.variables === record.id} />)}
        </section>
      </aside>
    </main>
  </AtlasShell>;
}
