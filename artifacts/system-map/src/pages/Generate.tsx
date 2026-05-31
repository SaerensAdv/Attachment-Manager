import { useEffect, useMemo, useRef, useState } from "react";
import { useGetDocGraph } from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2,
  Sparkles,
  Copy,
  Download,
  Check,
  Square,
  Wand2,
  RotateCcw,
  Users,
  X,
  Clock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { streamGenerateTeam } from "@/lib/generate";
import { routeRequest, type RoutingResult } from "@/lib/route";

interface Option {
  path: string;
  title: string;
}

interface AgentSegment {
  path: string;
  title: string;
  role: "lead" | "member";
  content: string;
  status: "queued" | "working" | "done";
}

export default function Generate() {
  const { data: graphData, isLoading, error } = useGetDocGraph();

  const [clientPath, setClientPath] = useState("");
  const [request, setRequest] = useState("");

  // Routing state — the Orchestrator decides workflow + agent from the request.
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [result, setResult] = useState<RoutingResult | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);

  // Detected choices, editable as an override before generating.
  const [workflowPath, setWorkflowPath] = useState("");
  const [agentPath, setAgentPath] = useState("");
  // The supporting team (in execution order), editable before generating.
  const [memberPaths, setMemberPaths] = useState<string[]>([]);

  // Generation state — one segment per agent in the team.
  const [segments, setSegments] = useState<AgentSegment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Elapsed time since generation started, so a long sequential chain always
  // shows visible movement instead of silence while an agent thinks.
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const byCategory = (cat: string): Option[] =>
    (graphData?.nodes ?? [])
      .filter((n) => n.category === cat)
      .map((n) => ({ path: n.path, title: n.title }))
      .sort((a, b) => a.title.localeCompare(b.title));

  const clients = useMemo(() => byCategory("client"), [graphData]);
  const workflows = useMemo(() => byCategory("workflow"), [graphData]);

  const allAgents = useMemo(
    () => byCategory("agent").filter((a) => a.path !== "agents/orchestrator.md"),
    [graphData],
  );

  // Agents connected to the chosen workflow in the doc graph are surfaced as
  // recommendations when overriding, but the user can still pick any agent.
  const recommendedPaths = useMemo(() => {
    if (!workflowPath || !graphData) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graphData.edges) {
      if (e.source === workflowPath && e.target.startsWith("agents/"))
        ids.add(e.target);
      if (e.target === workflowPath && e.source.startsWith("agents/"))
        ids.add(e.source);
    }
    return ids;
  }, [workflowPath, graphData]);

  const recommendedAgents = allAgents.filter((a) => recommendedPaths.has(a.path));
  const otherAgents = allAgents.filter((a) => !recommendedPaths.has(a.path));

  const isRouted = !!result && !result.needsClarification;

  // Tear down everything tied to the current request: abort any in-flight
  // routing AND generation, and clear all derived state. Called whenever the
  // client or request changes so a stale routing/stream can never leak into a
  // newer request.
  const resetFlow = () => {
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setRouting(false);
    setIsStreaming(false);
    setResult(null);
    setRouteError(null);
    setWorkflowPath("");
    setAgentPath("");
    setMemberPaths([]);
    setSegments([]);
    setStreamError(null);
  };

  const hasActiveFlow =
    routing ||
    isStreaming ||
    !!result ||
    segments.length > 0 ||
    !!routeError ||
    !!streamError;

  const canRoute = !!clientPath && request.trim().length > 0 && !routing;

  const handleRoute = async () => {
    if (!canRoute) return;
    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouting(true);
    setRouteError(null);
    setResult(null);
    setWorkflowPath("");
    setAgentPath("");
    setMemberPaths([]);
    setSegments([]);
    setStreamError(null);

    try {
      const r = await routeRequest(
        { clientPath, request: request.trim() },
        controller.signal,
      );
      setResult(r);
      if (!r.needsClarification) {
        setWorkflowPath(r.workflow?.path ?? "");
        setAgentPath(r.agent?.path ?? "");
        setMemberPaths(
          r.additionalAgents
            .map((a) => a.path)
            .filter((p) => p !== r.agent?.path),
        );
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setRouteError(err instanceof Error ? err.message : "Routering mislukt");
    } finally {
      if (routeAbortRef.current === controller) routeAbortRef.current = null;
      setRouting(false);
    }
  };

  // Full team in execution order: lead first, then members (deduped).
  const teamPaths = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of [agentPath, ...memberPaths]) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
    return out;
  }, [agentPath, memberPaths]);

  const titleFor = (path: string) =>
    allAgents.find((a) => a.path === path)?.title ??
    result?.additionalAgents.find((a) => a.path === path)?.title ??
    result?.agent?.title ??
    "Teamlid";

  const removeMember = (path: string) =>
    setMemberPaths((prev) => prev.filter((p) => p !== path));

  const canGenerate =
    isRouted &&
    !!clientPath &&
    !!workflowPath &&
    // A lead agent is required — members alone can't generate. Overriding the
    // workflow clears agentPath, so guard against members-only state here.
    !!agentPath &&
    teamPaths.length > 0 &&
    request.trim().length > 0;

  const handleGenerate = async () => {
    if (!canGenerate || isStreaming) return;
    // Show the whole team as a queue up front so the user immediately sees who
    // will work and in what order — no blank wait before the first token.
    setSegments(
      teamPaths.map((path, i) => ({
        path,
        title: titleFor(path),
        role: i === 0 ? "lead" : "member",
        content: "",
        status: "queued" as const,
      })),
    );
    setStreamError(null);
    setIsStreaming(true);
    startedAtRef.current = Date.now();
    setElapsed(0);
    const controller = new AbortController();
    abortRef.current = controller;

    await streamGenerateTeam(
      {
        agentPath,
        additionalAgentPaths: memberPaths,
        clientPath,
        workflowPath,
        request: request.trim(),
      },
      {
        onAgentStart: (info) =>
          setSegments((prev) => {
            const next = [...prev];
            // Reconcile the optimistic queue with the backend's authoritative
            // team size: drop any trailing placeholders the backend didn't run.
            if (info.total > 0 && next.length > info.total) {
              next.length = info.total;
            }
            if (info.index < 0) return next;
            next[info.index] = {
              path: info.agent.path,
              title: info.agent.title,
              role: info.role,
              content: next[info.index]?.content ?? "",
              status: "working",
            };
            return next;
          }),
        onDelta: (index, text) =>
          setSegments((prev) =>
            prev.map((s, i) =>
              i === index ? { ...s, content: s.content + text } : s,
            ),
          ),
        onAgentDone: (index) =>
          setSegments((prev) =>
            prev.map((s, i) =>
              i === index ? { ...s, status: "done" } : s,
            ),
          ),
        onDone: () => {
          setIsStreaming(false);
          abortRef.current = null;
        },
        onError: (message) => {
          setStreamError(message);
          setIsStreaming(false);
          abortRef.current = null;
        },
        signal: controller.signal,
      },
    );
  };

  const combinedOutput = useMemo(
    () =>
      segments
        .map((s) =>
          s.content.trim() ? `# ${s.title}\n\n${s.content.trim()}` : "",
        )
        .filter(Boolean)
        .join("\n\n---\n\n"),
    [segments],
  );

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  // Abort any in-flight work when leaving the page.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      routeAbortRef.current?.abort();
    };
  }, []);

  // Tick the elapsed-time counter once per second while generating.
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  const doneCount = segments.filter((s) => s.status === "done").length;
  const activeStep = Math.min(doneCount + (isStreaming ? 1 : 0), segments.length);
  const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(combinedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([combinedOutput], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saerens-output.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-cat-agent" />
          <p className="font-mono text-sm tracking-widest text-muted-foreground">
            LADEN...
          </p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Kon de gegevens niet laden
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Controleer je verbinding of de API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-10 grid grid-cols-1 lg:grid-cols-[26rem_1fr] gap-6">
        {/* Config panel */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-mono font-bold tracking-tight text-2xl uppercase flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cat-agent" />
              Genereren
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kies de klant en beschrijf je opdracht. Het team bepaalt zelf wie
              eraan werkt — jij bevestigt of past de keuze aan.
            </p>
          </div>

          <div className="flex flex-col gap-4 bg-card/60 border border-card-border rounded-lg p-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Klant
              </label>
              <Select
                value={clientPath}
                onValueChange={(v) => {
                  setClientPath(v);
                  if (hasActiveFlow) resetFlow();
                }}
              >
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Kies een klant" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.path} value={c.path}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Opdracht
              </label>
              <Textarea
                value={request}
                onChange={(e) => {
                  setRequest(e.target.value);
                  if (hasActiveFlow) resetFlow();
                }}
                placeholder="Bv. Schrijf een maandelijkse update-mail over de Google Ads-resultaten van vorige maand."
                rows={6}
                className="resize-none"
                data-testid="input-request"
              />
            </div>

            {routeError && (
              <div className="text-sm text-destructive">⚠️ {routeError}</div>
            )}

            {result?.needsClarification && (
              <div
                className="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 px-3 py-2"
                data-testid="text-clarification"
              >
                <span className="font-medium">Even verduidelijken: </span>
                {result.clarification}
              </div>
            )}

            {/* Routing trigger — shown until we have a confident routing. */}
            {!isRouted && (
              <Button
                onClick={handleRoute}
                disabled={!canRoute}
                data-testid="button-route"
              >
                {routing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {routing ? "Bezig met herkennen..." : "Herken taak"}
              </Button>
            )}
          </div>

          {/* Routing review — detected workflow + agent, editable before generating. */}
          {isRouted && (
            <div className="flex flex-col gap-4 bg-card/60 border border-card-border rounded-lg p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Herkend door het team
                </span>
                {result?.taskType && (
                  <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-cat-agent/15 text-cat-agent border border-cat-agent/30">
                    {result.taskType}
                  </span>
                )}
              </div>

              {result?.reasoning && (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="text-reasoning"
                >
                  {result.reasoning}
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Workflow
                </label>
                <Select
                  value={workflowPath}
                  onValueChange={(v) => {
                    setWorkflowPath(v);
                    setAgentPath("");
                  }}
                >
                  <SelectTrigger data-testid="select-workflow">
                    <SelectValue placeholder="Geen specifieke workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((w) => (
                      <SelectItem key={w.path} value={w.path}>
                        {w.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Agent
                </label>
                <Select value={agentPath} onValueChange={setAgentPath}>
                  <SelectTrigger data-testid="select-agent">
                    <SelectValue placeholder="Kies een agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {recommendedAgents.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Aanbevolen voor deze workflow</SelectLabel>
                        {recommendedAgents.map((a) => (
                          <SelectItem key={a.path} value={a.path}>
                            {a.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      {recommendedAgents.length > 0 && (
                        <SelectLabel>Overige agents</SelectLabel>
                      )}
                      {otherAgents.map((a) => (
                        <SelectItem key={a.path} value={a.path}>
                          {a.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div
                className="flex flex-col gap-2"
                data-testid="text-additional-agents"
              >
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  Team ({teamPaths.length}){" "}
                  {teamPaths.length > 1 && "— werkt na elkaar"}
                </div>
                <ol className="flex flex-col gap-1.5">
                  {teamPaths.map((p, i) => (
                    <li
                      key={p}
                      className="flex items-center gap-2 text-sm rounded-md border border-card-border bg-background/40 px-3 py-1.5"
                      data-testid={`team-member-${i}`}
                    >
                      <span className="text-[11px] font-mono text-muted-foreground w-4 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="flex-1 truncate">{titleFor(p)}</span>
                      {i === 0 ? (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cat-agent/15 text-cat-agent border border-cat-agent/30 shrink-0">
                          Hoofd
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeMember(p)}
                          disabled={isStreaming}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 shrink-0"
                          aria-label={`Verwijder ${titleFor(p)}`}
                          data-testid={`button-remove-member-${i}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {isStreaming ? (
                <Button
                  variant="secondary"
                  onClick={handleStop}
                  data-testid="button-stop"
                >
                  <Square className="w-4 h-4" />
                  Stoppen
                </Button>
              ) : (
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  data-testid="button-generate"
                >
                  <Sparkles className="w-4 h-4" />
                  Genereer
                </Button>
              )}

              <button
                type="button"
                onClick={handleRoute}
                disabled={routing || isStreaming}
                className="self-start inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid="button-reroute"
              >
                <RotateCcw className="w-3 h-3" />
                Opnieuw herkennen
              </button>
            </div>
          )}
        </div>

        {/* Output panel */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between gap-2 min-h-9">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Resultaat
            </span>
            {isStreaming && segments.length > 0 && (
              <div
                className="flex items-center gap-2 text-xs text-muted-foreground"
                data-testid="text-progress"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cat-agent" />
                <span className="font-mono">
                  Teamlid {activeStep}/{segments.length}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="w-3 h-3" />
                  {elapsedLabel}
                </span>
              </div>
            )}
            {combinedOutput && !isStreaming && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  data-testid="button-copy"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-cat-knowledge" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? "Gekopieerd" : "Kopiëren"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  data-testid="button-download"
                >
                  <Download className="w-4 h-4" />
                  Downloaden
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 bg-card/60 border border-card-border rounded-lg p-6 min-h-[24rem]">
            {streamError && (
              <div className="text-sm text-destructive mb-4">
                ⚠️ {streamError}
              </div>
            )}
            {segments.length === 0 && !isStreaming && !streamError && (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                <p className="max-w-sm text-sm">
                  De gegenereerde output verschijnt hier. Het team werkt na
                  elkaar — elke bijdrage is een eerste versie die een teamlid
                  moet nakijken voor publicatie.
                </p>
              </div>
            )}
            {segments.length > 0 && (
              <div className="flex flex-col gap-6">
                {segments.map((seg, i) => (
                  <div
                    key={`${seg.path}-${i}`}
                    className="flex flex-col gap-3"
                    data-testid={`segment-${i}`}
                  >
                    <div className="flex items-center gap-2 border-b border-card-border pb-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-cat-agent/15 text-cat-agent text-[11px] font-mono shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-mono text-sm font-semibold tracking-tight">
                        {seg.title}
                      </span>
                      {seg.role === "lead" && (
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cat-agent/15 text-cat-agent border border-cat-agent/30">
                          Hoofd
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        {seg.status === "queued" ? (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            In wachtrij
                          </>
                        ) : seg.status === "working" ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Aan het werk
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 text-cat-knowledge" />
                            Klaar
                          </>
                        )}
                      </span>
                    </div>
                    <article className="prose prose-invert prose-sm max-w-none prose-headings:font-mono prose-headings:tracking-tight prose-a:text-cat-agent">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {seg.content}
                      </ReactMarkdown>
                      {seg.status === "working" && (
                        <span className="inline-block w-2 h-4 bg-cat-agent animate-pulse align-middle ml-0.5" />
                      )}
                    </article>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
