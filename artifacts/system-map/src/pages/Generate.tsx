import { useEffect, useMemo, useRef, useState } from "react";
import { useGetDocGraph } from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2,
  Copy,
  Download,
  Check,
  Square,
  Play,
  ArrowRight,
  RotateCcw,
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
import { streamGenerateTeam } from "@/lib/generate";
import { routeRequest, type RoutingResult } from "@/lib/route";
import { fetchIntake, type IntakeField } from "@/lib/intake";

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

// Shared editorial styling for the restyled shadcn selects.
const selectTriggerClass =
  "h-11 rounded-none border-foreground bg-card font-['Inter'] text-sm focus:ring-0 focus:ring-offset-0 focus:border-accent shadow-none";
const selectContentClass =
  "rounded-none border-foreground bg-card text-foreground shadow-[4px_4px_0px_hsl(var(--foreground))]";
const selectItemClass =
  "rounded-none font-['Inter'] focus:bg-foreground focus:text-background";

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

  // Smart intake — after routing, detect which essential inputs are still
  // missing so the user can supply them before the specialist generates.
  const [intakeFields, setIntakeFields] = useState<IntakeField[]>([]);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
  const [intakeLoading, setIntakeLoading] = useState(false);
  const intakeAbortRef = useRef<AbortController | null>(null);

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
    intakeAbortRef.current?.abort();
    intakeAbortRef.current = null;
    setIntakeFields([]);
    setIntakeAnswers({});
    setIntakeLoading(false);
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

  // Once a routing is confirmed (and whenever the agent/workflow override
  // changes), ask the backend which essential inputs are still missing so we
  // can collect them before generating. Best-effort: failures fall back to no
  // extra fields rather than blocking the flow.
  useEffect(() => {
    if (!isRouted || !agentPath || !clientPath) return;
    const controller = new AbortController();
    intakeAbortRef.current = controller;
    setIntakeLoading(true);
    fetchIntake(
      {
        agentPath,
        workflowPath: workflowPath || null,
        clientPath,
        request: request.trim(),
      },
      controller.signal,
    )
      .then((fields) => {
        // Ignore a stale response if a newer intake fetch has superseded this
        // one (agent/workflow override) — otherwise it could overwrite fresher
        // fields.
        if (intakeAbortRef.current !== controller) return;
        setIntakeFields(fields);
        // Keep any answers the user already typed for keys that still apply.
        setIntakeAnswers((prev) => {
          const next: Record<string, string> = {};
          for (const f of fields) next[f.key] = prev[f.key] ?? "";
          return next;
        });
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (intakeAbortRef.current !== controller) return;
        setIntakeFields([]);
      })
      .finally(() => {
        if (intakeAbortRef.current === controller) {
          intakeAbortRef.current = null;
          setIntakeLoading(false);
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouted, agentPath, workflowPath, clientPath]);

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

  // Fold any filled-in intake answers into the request so the specialist works
  // from concrete data instead of guessing. Empty fields are left out (the
  // agent will mark them as [AAN TE VULLEN]).
  const composeRequest = () => {
    const base = request.trim();
    const lines = intakeFields
      .map((f) => {
        const v = intakeAnswers[f.key]?.trim();
        return v ? `- ${f.label}: ${v}` : "";
      })
      .filter(Boolean);
    if (lines.length === 0) return base;
    return `${base}\n\n## Aanvullende gegevens (door gebruiker aangeleverd)\n${lines.join("\n")}`;
  };

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
        request: composeRequest(),
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
      intakeAbortRef.current?.abort();
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
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-7 h-7 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-muted-foreground">
            De pers wordt opgewarmd...
          </p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground px-6">
        <div className="text-center border border-foreground bg-card p-10 max-w-md shadow-[4px_4px_0px_hsl(var(--foreground))]">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-3">
            Editie ingetrokken
          </p>
          <h1 className="font-['Playfair_Display'] text-3xl font-black tracking-tight">
            Kon de gegevens niet laden
          </h1>
          <p className="mt-3 text-sm text-muted-foreground font-['Inter']">
            Controleer je verbinding of de API-status en probeer opnieuw.
          </p>
        </div>
      </div>
    );
  }

  const isActive = routing || isStreaming;

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter'] selection:bg-accent selection:text-accent-foreground pt-16">
      <div className="flex flex-col lg:flex-row">
        {/* ============================================================== */}
        {/* LEFT COLUMN — OPDRACHTBUREAU                                    */}
        {/* ============================================================== */}
        <div className="w-full lg:w-5/12 xl:w-[34%] border-b lg:border-b-0 lg:border-r border-foreground/20 flex flex-col">
          {/* Masthead */}
          <div className="px-8 pt-10 pb-8 border-b border-foreground/20">
            <div className="flex justify-between items-start mb-10">
              <h1 className="font-['Playfair_Display'] text-4xl font-black tracking-tight leading-none uppercase">
                Saerens
                <br />
                Desk
              </h1>
              <div className="text-right">
                <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Editie
                </div>
                <div className="font-['Playfair_Display'] text-xl italic">
                  No. 042
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-b border-foreground py-2">
              <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                Opdrachtbureau
              </span>
              <span
                className={`font-['Space_Mono'] text-[10px] uppercase tracking-widest ${
                  isActive ? "text-accent" : "text-muted-foreground"
                }`}
              >
                {isActive ? "Live" : "Gereed"}
              </span>
            </div>
          </div>

          {/* Briefing + team + parameters */}
          <div className="px-8 py-8 flex-1 flex flex-col gap-12">
            {/* I. Cliënt & Briefing */}
            <section className="space-y-5">
              <header className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                <h2 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                  I. Cliënt &amp; Briefing
                </h2>
                <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                  01
                </span>
              </header>

              <div className="space-y-6">
                <div>
                  <label className="block font-['Space_Mono'] text-[11px] uppercase mb-2 tracking-widest text-muted-foreground">
                    Dossier
                  </label>
                  <Select
                    value={clientPath}
                    onValueChange={(v) => {
                      setClientPath(v);
                      if (hasActiveFlow) resetFlow();
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-client"
                      className={selectTriggerClass}
                    >
                      <SelectValue placeholder="Kies een klantdossier" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      {clients.map((c) => (
                        <SelectItem
                          key={c.path}
                          value={c.path}
                          className={selectItemClass}
                        >
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block font-['Space_Mono'] text-[11px] uppercase mb-2 tracking-widest text-muted-foreground">
                    Opdracht
                  </label>
                  <Textarea
                    value={request}
                    onChange={(e) => {
                      setRequest(e.target.value);
                      if (hasActiveFlow) resetFlow();
                    }}
                    placeholder="Bv. Schrijf een maandelijkse update-mail over de Google Ads-resultaten van vorige maand."
                    rows={5}
                    className="rounded-none border-foreground bg-card font-['Playfair_Display'] text-lg italic resize-none shadow-none focus-visible:ring-0 focus-visible:border-accent placeholder:not-italic placeholder:font-['Inter'] placeholder:text-base"
                    data-testid="input-request"
                  />
                </div>

                {routeError && (
                  <div
                    className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive font-['Inter']"
                  >
                    {routeError}
                  </div>
                )}

                {result?.needsClarification && (
                  <div
                    className="border-l-2 border-accent bg-accent/5 px-3 py-2 text-sm font-['Inter']"
                    data-testid="text-clarification"
                  >
                    <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent block mb-1">
                      Even verduidelijken
                    </span>
                    {result.clarification}
                  </div>
                )}

                {/* Routing trigger — shown until we have a confident routing. */}
                {!isRouted && (
                  <button
                    type="button"
                    onClick={handleRoute}
                    disabled={!canRoute}
                    data-testid="button-route"
                    className="w-full py-3 border border-foreground text-foreground font-['Space_Mono'] uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {routing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Bezig met herkennen...</span>
                      </>
                    ) : (
                      <>
                        <span>Taak Herkennen</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </section>

            {/* II. Redactieteam */}
            {isRouted && (
              <section className="space-y-5">
                <header className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                  <h2 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                    II. Redactieteam
                  </h2>
                  <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                    02
                  </span>
                </header>

                <div className="p-4 bg-card border border-foreground space-y-4 shadow-[4px_4px_0px_hsl(var(--foreground))]">
                  {/* Detected task type + reasoning */}
                  <div className="flex items-start gap-3">
                    {result?.taskType && (
                      <span className="bg-foreground text-background font-['Space_Mono'] text-[10px] px-2 py-1 uppercase tracking-widest shrink-0">
                        {result.taskType}
                      </span>
                    )}
                    {result?.reasoning && (
                      <p
                        className="font-['Inter'] text-sm leading-snug"
                        data-testid="text-reasoning"
                      >
                        {result.reasoning}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-foreground/20 pt-4">
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div>
                        <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1.5 tracking-widest text-muted-foreground">
                          Workflow
                        </label>
                        <Select
                          value={workflowPath}
                          onValueChange={(v) => {
                            setWorkflowPath(v);
                            setAgentPath("");
                          }}
                        >
                          <SelectTrigger
                            data-testid="select-workflow"
                            className={selectTriggerClass}
                          >
                            <SelectValue placeholder="Geen specifieke workflow" />
                          </SelectTrigger>
                          <SelectContent className={selectContentClass}>
                            {workflows.map((w) => (
                              <SelectItem
                                key={w.path}
                                value={w.path}
                                className={selectItemClass}
                              >
                                {w.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1.5 tracking-widest text-muted-foreground">
                          Lead / Agent
                        </label>
                        <Select value={agentPath} onValueChange={setAgentPath}>
                          <SelectTrigger
                            data-testid="select-agent"
                            className={selectTriggerClass}
                          >
                            <SelectValue placeholder="Kies een hoofdredacteur" />
                          </SelectTrigger>
                          <SelectContent className={selectContentClass}>
                            {recommendedAgents.length > 0 && (
                              <SelectGroup>
                                <SelectLabel className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                                  Aanbevolen voor deze workflow
                                </SelectLabel>
                                {recommendedAgents.map((a) => (
                                  <SelectItem
                                    key={a.path}
                                    value={a.path}
                                    className={selectItemClass}
                                  >
                                    {a.title}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            <SelectGroup>
                              {recommendedAgents.length > 0 && (
                                <SelectLabel className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                                  Overige agents
                                </SelectLabel>
                              )}
                              {otherAgents.map((a) => (
                                <SelectItem
                                  key={a.path}
                                  value={a.path}
                                  className={selectItemClass}
                                >
                                  {a.title}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Team composition list */}
                    <div
                      className="space-y-2"
                      data-testid="text-additional-agents"
                    >
                      <label className="flex items-center justify-between font-['Space_Mono'] text-[10px] uppercase mb-1 tracking-widest text-muted-foreground">
                        <span>Samenstelling</span>
                        <span>
                          {teamPaths.length}{" "}
                          {teamPaths.length === 1 ? "redacteur" : "redacteurs"}
                          {teamPaths.length > 1 && " — na elkaar"}
                        </span>
                      </label>

                      {teamPaths.map((p, i) => {
                        const seg = segments.find((s) => s.path === p);
                        const isLead = i === 0;
                        const note =
                          seg?.status === "working"
                            ? "Bezig..."
                            : seg?.status === "done"
                              ? "Klaar"
                              : seg?.status === "queued"
                                ? "In wachtrij"
                                : null;
                        return (
                          <div
                            key={p}
                            data-testid={`team-member-${i}`}
                            className={`flex items-center gap-3 text-sm p-2 border-l-2 ${
                              isLead
                                ? "border-accent bg-accent/5"
                                : "border-foreground bg-secondary/40"
                            }`}
                          >
                            <span
                              className={`font-['Space_Mono'] text-xs shrink-0 ${
                                isLead ? "text-accent" : "text-muted-foreground"
                              }`}
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span
                              className={`font-medium truncate ${
                                isLead ? "text-accent" : ""
                              }`}
                            >
                              {titleFor(p)}
                            </span>
                            {note ? (
                              <span
                                className={`ml-auto text-xs italic shrink-0 ${
                                  seg?.status === "working"
                                    ? "text-accent"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {note}
                              </span>
                            ) : isLead ? (
                              <span className="ml-auto font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent shrink-0">
                                Hoofd
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => removeMember(p)}
                                disabled={isStreaming}
                                className="ml-auto text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 shrink-0"
                                aria-label={`Verwijder ${titleFor(p)}`}
                                data-testid={`button-remove-member-${i}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRoute}
                  disabled={routing || isStreaming}
                  className="inline-flex items-center gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  data-testid="button-reroute"
                >
                  <RotateCcw className="w-3 h-3" />
                  Opnieuw herkennen
                </button>
              </section>
            )}

            {/* III. Parameters — smart intake */}
            {isRouted && (intakeLoading || intakeFields.length > 0) && (
              <section className="space-y-5" data-testid="intake-block">
                <header className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                  <h2 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                    III. Parameters
                  </h2>
                  <span className="font-['Space_Mono'] text-xs text-muted-foreground flex items-center gap-2">
                    {intakeLoading && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    03
                  </span>
                </header>

                {intakeFields.length > 0 && (
                  <div className="space-y-5">
                    <p className="text-xs text-muted-foreground font-['Inter'] leading-snug">
                      Vul aan wat je weet zodat de redactie niet hoeft te gokken.
                      Leeg laten mag — dan markeert de specialist het als{" "}
                      <span className="font-['Space_Mono'] text-foreground">
                        [AAN TE VULLEN]
                      </span>
                      .
                    </p>
                    {intakeFields.map((f) => (
                      <div key={f.key}>
                        <label
                          htmlFor={`intake-${f.key}`}
                          className="block font-['Space_Mono'] text-[10px] uppercase mb-1 tracking-widest text-muted-foreground"
                        >
                          {f.label}
                        </label>
                        <input
                          id={`intake-${f.key}`}
                          type="text"
                          value={intakeAnswers[f.key] ?? ""}
                          onChange={(e) =>
                            setIntakeAnswers((prev) => ({
                              ...prev,
                              [f.key]: e.target.value,
                            }))
                          }
                          placeholder={f.example ? `bv. ${f.example}` : ""}
                          disabled={isStreaming}
                          data-testid={`input-intake-${f.key}`}
                          className="w-full border-b border-foreground bg-transparent pb-1 text-sm font-['Inter'] focus:outline-none focus:border-accent disabled:opacity-50 placeholder:text-muted-foreground"
                        />
                        {f.hint && (
                          <span className="block mt-1 text-[11px] text-muted-foreground font-['Inter']">
                            {f.hint}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Footer / Print action */}
          {isRouted && (
            <div className="px-8 py-6 border-t border-foreground/20 bg-background sticky bottom-0">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  data-testid="button-stop"
                  className="w-full py-4 uppercase font-['Space_Mono'] text-sm tracking-widest font-bold transition-all flex items-center justify-center gap-3 bg-accent text-accent-foreground border-2 border-accent shadow-[4px_4px_0px_hsl(var(--foreground))] active:shadow-none active:translate-x-1 active:translate-y-1"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop Persen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  data-testid="button-generate"
                  className="w-full py-4 uppercase font-['Space_Mono'] text-sm tracking-widest font-bold transition-all flex items-center justify-center gap-3 bg-foreground text-background border-2 border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] hover:bg-accent hover:border-accent hover:text-accent-foreground active:shadow-none active:translate-x-1 active:translate-y-1 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Drukken
                </button>
              )}
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN — DRUKPROEF                                        */}
        {/* ============================================================== */}
        <div className="w-full lg:w-7/12 xl:w-[66%] bg-card flex flex-col min-h-[60vh]">
          {/* Status bar */}
          <div className="sticky top-16 z-10 bg-card/90 backdrop-blur-sm border-b border-foreground/10 px-8 lg:px-12 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <span className="font-['Space_Mono'] text-xs uppercase tracking-widest flex items-center gap-2 shrink-0">
                <Loader2
                  className={`w-4 h-4 ${
                    isStreaming
                      ? "animate-spin text-accent"
                      : "text-muted-foreground"
                  }`}
                />
                {isStreaming
                  ? "Aan het drukken..."
                  : combinedOutput
                    ? "Voltooid"
                    : "Drukproef"}
              </span>
              {segments.length > 0 && (
                <span
                  className="font-['Space_Mono'] text-xs text-muted-foreground flex items-center gap-4 shrink-0"
                  data-testid="text-progress"
                >
                  <span>
                    Stap {activeStep}/{segments.length}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3 h-3" />
                    {elapsedLabel}
                  </span>
                </span>
              )}
            </div>

            {combinedOutput && !isStreaming && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Kopiëren"
                  aria-label="Kopiëren"
                  data-testid="button-copy"
                  className="p-2 hover:bg-background transition-colors text-foreground group"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 group-hover:text-accent" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  title="Downloaden"
                  aria-label="Downloaden"
                  data-testid="button-download"
                  className="p-2 hover:bg-background transition-colors text-foreground group"
                >
                  <Download className="w-4 h-4 group-hover:text-accent" />
                </button>
              </div>
            )}
          </div>

          {/* Output canvas */}
          <div className="px-8 lg:px-12 py-12 lg:py-16 max-w-3xl mx-auto w-full">
            {streamError && (
              <div className="mb-10 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive font-['Inter']">
                {streamError}
              </div>
            )}

            {segments.length === 0 && !isStreaming && !streamError && (
              <div className="h-[40vh] flex flex-col items-center justify-center text-center gap-4">
                <span className="font-['Playfair_Display'] text-5xl font-black italic text-foreground/10">
                  SA
                </span>
                <p className="max-w-sm text-sm text-muted-foreground font-['Inter']">
                  De drukproef verschijnt hier. De redactie werkt na elkaar —
                  elke bijdrage is een eerste versie die een teamlid moet
                  nakijken voor publicatie.
                </p>
              </div>
            )}

            {segments.length > 0 && (
              <div className="flex flex-col gap-16">
                {segments.map((seg, i) => {
                  const prevTitle =
                    i > 0 ? segments[i - 1].title : "de redactie";
                  const isDone = seg.status === "done";
                  const isWorking = seg.status === "working";
                  const isQueued = seg.status === "queued";
                  return (
                    <div
                      key={`${seg.path}-${i}`}
                      data-testid={`segment-${i}`}
                      className={`${
                        isDone
                          ? "opacity-70 transition-opacity hover:opacity-100"
                          : isQueued
                            ? "opacity-40"
                            : ""
                      }`}
                    >
                      <div
                        className={`flex items-center gap-4 mb-6 pb-2 border-b ${
                          isWorking ? "border-foreground" : "border-foreground/10"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isDone
                              ? "bg-green-600"
                              : isWorking
                                ? "bg-accent animate-pulse"
                                : "bg-foreground/30"
                          }`}
                        />
                        <h3
                          className={`font-['Space_Mono'] uppercase tracking-widest text-xs font-bold ${
                            isWorking ? "text-accent" : ""
                          }`}
                        >
                          {seg.title}
                        </h3>
                        {seg.role === "lead" && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                            Hoofd
                          </span>
                        )}
                        <span
                          className={`text-xs italic ml-auto shrink-0 ${
                            isWorking ? "text-accent/70" : "text-muted-foreground"
                          }`}
                        >
                          {isDone
                            ? "Klaar"
                            : isWorking
                              ? "Aan het schrijven..."
                              : "In wachtrij..."}
                        </span>
                      </div>

                      {isQueued && !seg.content ? (
                        <div className="h-24 border border-dashed border-foreground/20 flex items-center justify-center bg-background/50">
                          <span className="font-['Space_Mono'] text-xs text-muted-foreground uppercase tracking-widest">
                            Wachten op {prevTitle}...
                          </span>
                        </div>
                      ) : (
                        <article
                          className={`prose prose-sm max-w-none font-['Inter'] prose-headings:font-['Playfair_Display'] prose-headings:font-bold prose-headings:tracking-tight prose-strong:text-foreground prose-a:text-accent ${
                            seg.role === "lead"
                              ? "prose-p:font-['Playfair_Display'] prose-p:text-lg prose-p:leading-relaxed [&_p:first-of-type]:first-letter:float-left [&_p:first-of-type]:first-letter:font-['Playfair_Display'] [&_p:first-of-type]:first-letter:font-black [&_p:first-of-type]:first-letter:text-6xl [&_p:first-of-type]:first-letter:leading-[0.7] [&_p:first-of-type]:first-letter:mr-2 [&_p:first-of-type]:first-letter:mt-1 [&_p:first-of-type]:first-letter:text-foreground"
                              : ""
                          }`}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {seg.content}
                          </ReactMarkdown>
                          {isWorking && (
                            <span className="inline-block w-2 h-4 bg-accent animate-pulse align-middle ml-0.5" />
                          )}
                        </article>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
