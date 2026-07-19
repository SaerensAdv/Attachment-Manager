import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  useGetAgentRuns,
  useGetAgentStats,
  useGetGraphOverview,
  useGetTeam,
  type AgentRun,
  type GraphNode,
  type TeamMember,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronRight,
  ExternalLink,
  Loader2,
  PauseCircle,
  PlayCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import "./AtlasAgents.css";

type SourceFilter = "all" | "ai-team" | "super-agents";
type AgentEntry =
  | { key: string; source: "ai-team"; member: TeamMember; label: string; role: string; active: boolean }
  | { key: string; source: "super-agent"; node: GraphNode; label: string; role: string; active: boolean };

const formatDuration = (ms: number | null) =>
  ms == null ? "Unknown" : ms < 60000 ? `${Math.round(ms / 1000)} sec` : `${Math.round(ms / 60000)} min`;
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-BE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
    : "Never";
const initials = (label: string) =>
  label.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const githubAgentUrl = (member: TeamMember) =>
  `https://github.com/SaerensAdv/Attachment-Manager/blob/main/${member.path}`;
const metadataText = (metadata: Record<string, unknown>, key: string, fallback = "Not recorded") => {
  const value = metadata[key];
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : fallback;
  return typeof value === "string" && value.trim() ? value : fallback;
};

function Portrait({ member, large = false }: { member: TeamMember; large?: boolean }) {
  const src = member.portraitThumbUrl ?? member.portraitUrl;
  const label = member.name ?? member.title;
  return src
    ? <img className={large ? "agents-portrait is-large" : "agents-portrait"} src={src} alt={label} />
    : <i className={large ? "agents-portrait is-large" : "agents-portrait"}>{initials(label)}</i>;
}

function SuperAgentPortrait({ label, large = false }: { label: string; large?: boolean }) {
  return <i className={`${large ? "agents-portrait is-large" : "agents-portrait"} is-super`}><Bot /><span>{initials(label)}</span></i>;
}

function ReadOnlyNotice({ owner }: { owner: "ClickUp" | "GitHub" }) {
  return <div className="agents-form-warning"><ShieldCheck /><span><b>Read-only projection</b><p>{owner} owns this agent. Atlas visualizes identity, governance and runtime evidence, but never edits the canonical source.</p></span></div>;
}

function AgentInspector({ member, close }: { member: TeamMember; close: () => void }) {
  const stats = useGetAgentStats(member.slug);
  const runs = useGetAgentRuns(member.slug);
  const lifecycle = member.active ? "active" : "paused";
  const persona = [
    ["Personality", member.personality],
    ["Communication", member.communicationStyle],
    ["Cares most about", member.caresMostAbout],
    ["Signature habit", member.signatureHabit],
    ["Cultural fit", member.culturalFitNote],
  ] as const;

  return <section className="agents-inspector" data-lenis-prevent>
    <header><div className="agents-identity"><Portrait member={member} large /><span><small>Software agent · GitHub canonical</small><h2>{member.name ?? member.title}</h2><p>{member.oneLiner || member.roleSummary || "No persona summary recorded."}</p></span></div><button type="button" onClick={close} aria-label="Close agent"><X /></button></header>
    <div className="agents-lifecycle" data-lifecycle={lifecycle}>{member.active ? <PlayCircle /> : <PauseCircle />}<span><small>Runtime availability</small><b>{lifecycle}</b><p>{member.active ? "Available to the retained software runtime." : "Excluded from new routing, retained for history."}</p></span></div>
    <div className="agents-dossier">
      <section><ReadOnlyNotice owner="GitHub" /><small>Governance dossier</small><h3>Identity and ownership</h3><dl><div><dt>Canonical owner</dt><dd>GitHub, implementation-specific software configuration</dd></div><div><dt>Department</dt><dd>{member.department.title}</dd></div><div><dt>Routing</dt><dd>{member.active ? "Available" : "Not routable"}</dd></div>{member.roleSummary && <div><dt>Role</dt><dd>{member.roleSummary}</dd></div>}{persona.map(([label, value]) => value ? <div key={label}><dt>{label}</dt><dd>{value}</dd></div> : null)}</dl><a className="agents-open-source" href={githubAgentUrl(member)} target="_blank" rel="noreferrer">Open canonical source <ExternalLink /></a></section>
      <section><small>Performance context</small><h3>Runs and outcomes</h3>{stats.isLoading ? <Loader2 className="atlas-rotating" /> : stats.data ? <div className="agents-stats"><div><b>{stats.data.runsLed}</b><span>Runs led</span></div><div><b>{stats.data.runsParticipated}</b><span>Participated</span></div><div><b>{formatDuration(stats.data.avgDurationMs)}</b><span>Avg duration</span></div><div><b>{stats.data.approved}</b><span>Approved</span></div><div><b>{stats.data.rejected}</b><span>Rejected</span></div><div><b>{formatDate(stats.data.lastActiveAt)}</b><span>Last active</span></div></div> : <p className="agents-muted">Stats unavailable.</p>}<div className="agents-runs">{(runs.data?.runs ?? []).slice(0, 8).map((run: AgentRun) => <Link key={run.id} href={`/history?id=${run.id}`}><span><b>{run.clientName}</b><small>{run.workflowTitle} · {run.role}</small></span><ArrowRight /></Link>)}</div></section>
    </div>
  </section>;
}

function SuperAgentInspector({ node, close }: { node: GraphNode; close: () => void }) {
  const metadata = node.metadata as Record<string, unknown>;
  const lifecycle = node.status ?? "unknown";
  return <section className="agents-inspector" data-lenis-prevent>
    <header><div className="agents-identity"><SuperAgentPortrait label={node.label} large /><span><small>ClickUp Super Agent · ClickUp canonical</small><h2>{node.label}</h2><p>Workspace-native identity projected into the Atlas digital twin.</p></span></div><button type="button" onClick={close} aria-label="Close agent"><X /></button></header>
    <div className="agents-lifecycle" data-lifecycle={lifecycle}><ShieldCheck /><span><small>Runtime availability</small><b>{lifecycle}</b><p>State comes from the verified ClickUp source. Missing evidence is shown as degraded, never guessed.</p></span></div>
    <div className="agents-super-body"><section><ReadOnlyNotice owner="ClickUp" /><small>Governance dossier</small><h3>Native ownership</h3><dl><div><dt>Canonical owner</dt><dd>ClickUp</dd></div><div><dt>Agent type</dt><dd>Super Agent</dd></div><div><dt>Governance ID</dt><dd>{metadataText(metadata, "governanceId", "Not mapped")}</dd></div><div><dt>Instructions / Skill</dt><dd>{metadataText(metadata, "skill", metadataText(metadata, "instructions"))}</dd></div><div><dt>Tools</dt><dd>{metadataText(metadata, "tools")}</dd></div><div><dt>Triggers</dt><dd>{metadataText(metadata, "triggers")}</dd></div><div><dt>Approval boundary</dt><dd>{metadataText(metadata, "approvalBoundary", "Human gate for risky writes")}</dd></div></dl></section><section><small>Runtime evidence</small><h3>Verified projection</h3><p>Atlas keeps this agent visible beside software agents and system relationships, while all configuration stays in ClickUp.</p><dl><div><dt>Last verified</dt><dd>{metadataText(metadata, "verifiedAt", metadataText(metadata, "checkedAt"))}</dd></div><div><dt>Source state</dt><dd>{lifecycle}</dd></div></dl>{node.url && <a className="agents-open-source" href={node.url} target="_blank" rel="noreferrer">Open in ClickUp <ExternalLink /></a>}</section></div>
  </section>;
}

export default function AtlasAgents() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const team = useGetTeam();
  const graph = useGetGraphOverview();
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<"active" | "paused" | "all">("active");
  const [source, setSource] = useState<SourceFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(() => new URLSearchParams(searchString).get("agent"));
  const employees = useMemo(() => [...(team.data?.employees ?? [])].sort((a, b) => (a.name ?? a.title).localeCompare(b.name ?? b.title)), [team.data]);
  const superAgents = useMemo(() => (graph.data?.nodes ?? []).filter((node) => node.source === "clickup" && node.sourceType === "agent" && node.metadata.governanceKind === "super-agent").sort((a, b) => a.label.localeCompare(b.label)), [graph.data]);
  const entries = useMemo<AgentEntry[]>(() => [
    ...employees.map((member): AgentEntry => ({ key: member.slug, source: "ai-team", member, label: member.name ?? member.title, role: member.title, active: member.active })),
    ...superAgents.map((node): AgentEntry => ({ key: node.id, source: "super-agent", node, label: node.label, role: "ClickUp Super Agent", active: node.status === "active" || node.status === "testing" })),
  ], [employees, superAgents]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter((entry) =>
      (source === "all" || (source === "ai-team" ? entry.source === "ai-team" : entry.source === "super-agent")) &&
      (lifecycle === "all" || (lifecycle === "active" ? entry.active : !entry.active)) &&
      (!term || entry.label.toLowerCase().includes(term) || entry.role.toLowerCase().includes(term)));
  }, [entries, query, lifecycle, source]);
  const selected = entries.find((entry) => entry.key === selectedKey) ?? null;
  const choose = (entry: AgentEntry) => { setSelectedKey(entry.key); navigate(`/team?agent=${encodeURIComponent(entry.key)}`, { replace: true }); };
  const close = () => { setSelectedKey(null); navigate("/team", { replace: true }); };

  return <AtlasShell title="Agents" subtitle="Read-only projection of ClickUp-native and software agents"><main className="agents-stage"><aside className={`agents-index${selected ? " has-selection" : ""}`} data-lenis-prevent><div className="agents-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all agents" /></div><div className="agents-source-filters">{(["all", "ai-team", "super-agents"] as const).map((value) => <button key={value} type="button" className={source === value ? "is-active" : ""} onClick={() => setSource(value)}>{value === "all" ? "All" : value === "ai-team" ? "Software" : "Super Agents"}</button>)}</div><div className="agents-filters">{(["active", "paused", "all"] as const).map((value) => <button key={value} type="button" className={lifecycle === value ? "is-active" : ""} onClick={() => setLifecycle(value)}>{value}</button>)}</div><div className="agents-index-meta"><span>{visible.length} agents</span><span>{employees.length} GitHub · {superAgents.length} ClickUp</span></div>{team.isLoading && <div className="agents-state"><Loader2 className="atlas-rotating" />Loading software agents</div>}{graph.isLoading && <div className="agents-state"><Loader2 className="atlas-rotating" />Loading ClickUp agents</div>}{team.isError && <div className="agents-state is-error"><AlertTriangle />Software-agent source degraded</div>}{graph.isError && <div className="agents-state is-error"><AlertTriangle />ClickUp-agent source degraded</div>}<div className="agents-list">{visible.map((entry) => <button key={entry.key} type="button" className={selectedKey === entry.key ? "is-active" : ""} onClick={() => choose(entry)}>{entry.source === "ai-team" ? <Portrait member={entry.member} /> : <SuperAgentPortrait label={entry.label} />}<span><b>{entry.label}</b><small>{entry.role}</small><p>{entry.source === "ai-team" ? "GitHub canonical" : "ClickUp canonical"}</p></span><i data-active={entry.active} /><ChevronRight /></button>)}</div></aside>{selected?.source === "ai-team" ? <AgentInspector member={selected.member} close={close} /> : selected?.source === "super-agent" ? <SuperAgentInspector node={selected.node} close={close} /> : <section className="agents-empty"><Bot /><h2>Select an agent</h2><p>Inspect identity, governance, runtime evidence and relationships. Configuration stays in its canonical system.</p></section>}</main></AtlasShell>;
}
