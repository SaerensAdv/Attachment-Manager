import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetGenerationsQueryKey,
  type DocNode,
  type DocEdge,
} from "@workspace/api-client-react";
import { streamGenerateTeam, type DeliverableMeta } from "@/lib/generate";
import { routeRequest, type RoutingResult } from "@/lib/route";
import { fetchIntake, type IntakeField } from "@/lib/intake";

export interface Option {
  path: string;
  title: string;
}

export interface AgentSegment {
  path: string;
  title: string;
  role: "lead" | "member";
  content: string;
  status: "queued" | "working" | "done";
  /** True when this agent hit the model's token limit and may be cut off. */
  truncated: boolean;
}

export type DeliverableStatus = "idle" | "working" | "done" | "error";

/**
 * Encapsulates the whole one-shot generation pipeline (orchestrator routing ->
 * optional intake -> sequential team streaming -> deliverable -> archive) so it
 * can be driven from the Kaart command bar instead of the old standalone page.
 *
 * Besides the UI state, it derives a small "live run" model the map uses to come
 * alive: which team nodes are involved, which agent is currently working, and
 * the hand-off edge between the previous and the current agent.
 */
export function useGeneration(
  nodes: DocNode[] | undefined,
  edges: DocEdge[] | undefined,
) {
  const queryClient = useQueryClient();
  const [justSaved, setJustSaved] = useState(false);

  const [clientPath, setClientPath] = useState("");
  const [request, setRequest] = useState("");

  // Routing — the Orchestrator decides workflow + agent from the request.
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [result, setResult] = useState<RoutingResult | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);

  // Detected choices, editable as an override before generating.
  const [workflowPath, setWorkflowPath] = useState("");
  const [agentPath, setAgentPath] = useState("");
  const [memberPaths, setMemberPaths] = useState<string[]>([]);

  // Smart intake — essential inputs still missing after routing.
  const [intakeFields, setIntakeFields] = useState<IntakeField[]>([]);
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
  const [intakeLoading, setIntakeLoading] = useState(false);
  const intakeAbortRef = useRef<AbortController | null>(null);

  // Generation — one segment per agent in the team.
  const [segments, setSegments] = useState<AgentSegment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // True once a run has finished (done or stopped) so the map can settle back to
  // its normal state while the result panel stays on screen.
  const [runCompleted, setRunCompleted] = useState(false);

  // Deliverable layer — the concrete end product streamed in like an agent.
  const [deliverable, setDeliverable] = useState<DeliverableMeta | null>(null);
  const [deliverableContent, setDeliverableContent] = useState("");
  const [deliverableStatus, setDeliverableStatus] =
    useState<DeliverableStatus>("idle");
  const [deliverableError, setDeliverableError] = useState<string | null>(null);
  const [deliverableCopied, setDeliverableCopied] = useState(false);
  // True when the deliverable hit the model's token limit and may be cut off.
  const [deliverableTruncated, setDeliverableTruncated] = useState(false);
  // Non-blocking notes from the run (e.g. live account data unavailable, so the
  // deliverable used fallbacks) — surfaced so a fallback is never silent.
  const [deliverableNotes, setDeliverableNotes] = useState<string[]>([]);

  // Elapsed time since generation started.
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const byCategory = (cat: string): Option[] =>
    (nodes ?? [])
      .filter((n) => n.category === cat)
      .map((n) => ({ path: n.path, title: n.title }))
      .sort((a, b) => a.title.localeCompare(b.title));

  const clients = useMemo(() => byCategory("client"), [nodes]);
  const workflows = useMemo(() => byCategory("workflow"), [nodes]);

  const allAgents = useMemo(
    () => byCategory("agent").filter((a) => a.path !== "agents/orchestrator.md"),
    [nodes],
  );

  // Agents connected to the chosen workflow in the doc graph are surfaced as
  // recommendations when overriding, but any agent can still be picked.
  const recommendedPaths = useMemo(() => {
    if (!workflowPath || !edges) return new Set<string>();
    const ids = new Set<string>();
    for (const e of edges) {
      if (e.source === workflowPath && e.target.startsWith("agents/"))
        ids.add(e.target);
      if (e.target === workflowPath && e.source.startsWith("agents/"))
        ids.add(e.source);
    }
    return ids;
  }, [workflowPath, edges]);

  const recommendedAgents = useMemo(
    () => allAgents.filter((a) => recommendedPaths.has(a.path)),
    [allAgents, recommendedPaths],
  );
  const otherAgents = useMemo(
    () => allAgents.filter((a) => !recommendedPaths.has(a.path)),
    [allAgents, recommendedPaths],
  );

  const isRouted = !!result && !result.needsClarification;

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
    setDeliverable(null);
    setDeliverableContent("");
    setDeliverableStatus("idle");
    setDeliverableError(null);
    setDeliverableTruncated(false);
    setDeliverableNotes([]);
    setRunCompleted(false);
    setJustSaved(false);
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
    setRunCompleted(false);
    setJustSaved(false);
    setDeliverable(null);
    setDeliverableContent("");
    setDeliverableStatus("idle");
    setDeliverableError(null);
    setDeliverableTruncated(false);
    setDeliverableNotes([]);

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

  // After routing (and on agent/workflow override) detect missing essential
  // inputs. Best-effort: failures fall back to no extra fields.
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
        if (intakeAbortRef.current !== controller) return;
        setIntakeFields(fields);
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
    !!agentPath &&
    teamPaths.length > 0 &&
    request.trim().length > 0;

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
    setSegments(
      teamPaths.map((path, i) => ({
        path,
        title: titleFor(path),
        role: i === 0 ? "lead" : "member",
        content: "",
        status: "queued" as const,
        truncated: false,
      })),
    );
    setStreamError(null);
    setJustSaved(false);
    setRunCompleted(false);
    setDeliverable(null);
    setDeliverableContent("");
    setDeliverableStatus("idle");
    setDeliverableError(null);
    setDeliverableTruncated(false);
    setDeliverableNotes([]);
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
              truncated: false,
            };
            return next;
          }),
        onDelta: (index, text) =>
          setSegments((prev) =>
            prev.map((s, i) =>
              i === index ? { ...s, content: s.content + text } : s,
            ),
          ),
        onAgentDone: (index, truncated) =>
          setSegments((prev) =>
            prev.map((s, i) =>
              i === index ? { ...s, status: "done", truncated } : s,
            ),
          ),
        onDeliverableStart: (meta) => {
          setDeliverable(meta);
          setDeliverableContent("");
          setDeliverableError(null);
          setDeliverableTruncated(false);
          setDeliverableStatus("working");
        },
        onDeliverableDelta: (text) =>
          setDeliverableContent((prev) => prev + text),
        onDeliverableDone: (truncated) => {
          setDeliverableStatus("done");
          setDeliverableTruncated(truncated);
        },
        onDeliverableError: (message) => {
          setDeliverableError(message);
          setDeliverableStatus("error");
        },
        onDeliverableNote: (message) =>
          setDeliverableNotes((prev) =>
            prev.includes(message) ? prev : [...prev, message],
          ),
        onDone: (archived) => {
          setIsStreaming(false);
          abortRef.current = null;
          setRunCompleted(true);
          setJustSaved(archived);
          if (archived) {
            queryClient.invalidateQueries({
              queryKey: getGetGenerationsQueryKey(),
            });
          }
        },
        onError: (message) => {
          setStreamError(message);
          setIsStreaming(false);
          abortRef.current = null;
          setRunCompleted(true);
          // Stop any lingering live indicators after a dropped/failed stream:
          // finalize the segment that was mid-write (its partial text stays
          // visible) and drop segments that never started, so nothing keeps
          // spinning. The error banner explains why the run stopped.
          setSegments((prev) =>
            prev
              .filter((s) => s.status !== "queued" || s.content.length > 0)
              .map((s) =>
                s.status === "working" ? { ...s, status: "done" as const } : s,
              ),
          );
          // A deliverable that was still assembling will never finish now.
          setDeliverableStatus((s) => (s === "working" ? "error" : s));
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
    setRunCompleted(true);
  };

  // Abort any in-flight work when the consumer unmounts.
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

  const handleDeliverableCopy = async () => {
    await navigator.clipboard.writeText(deliverableContent);
    setDeliverableCopied(true);
    setTimeout(() => setDeliverableCopied(false), 1500);
  };

  const handleDeliverableDownload = () => {
    if (!deliverable) return;
    const blob = new Blob([deliverableContent], { type: deliverable.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = deliverable.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Live-run model for the map -----------------------------------------
  // The team is "involved" while the routing review is open or a run streams;
  // once a run completes the map settles back to normal.
  const mapLive = isStreaming || (isRouted && !runCompleted);
  const involvedPaths = useMemo(
    () => (mapLive ? teamPaths : []),
    [mapLive, teamPaths],
  );

  // The agent currently writing pulses; the previous one feeds the hand-off
  // edge so the map shows work flowing from colleague to colleague.
  const { activePath, handoff } = useMemo(() => {
    if (!isStreaming) return { activePath: null, handoff: null };
    const i = segments.findIndex((s) => s.status === "working");
    if (i < 0) return { activePath: null, handoff: null };
    const active = segments[i].path;
    const prev = i > 0 ? segments[i - 1].path : null;
    return {
      activePath: active,
      handoff:
        prev && prev !== active ? { source: prev, target: active } : null,
    };
  }, [isStreaming, segments]);

  const nodeStatus = useMemo(() => {
    const map = new Map<string, "queued" | "working" | "done">();
    if (!mapLive) return map;
    for (const s of segments) {
      map.set(s.path, s.status);
    }
    return map;
  }, [segments, mapLive]);

  return {
    // data lists
    clients,
    workflows,
    allAgents,
    recommendedPaths,
    recommendedAgents,
    otherAgents,
    // briefing
    clientPath,
    setClientPath,
    request,
    setRequest,
    // routing
    routing,
    routeError,
    result,
    isRouted,
    handleRoute,
    canRoute,
    // team
    workflowPath,
    setWorkflowPath,
    agentPath,
    setAgentPath,
    memberPaths,
    teamPaths,
    titleFor,
    removeMember,
    // intake
    intakeFields,
    intakeAnswers,
    setIntakeAnswers,
    intakeLoading,
    // generation
    segments,
    isStreaming,
    streamError,
    canGenerate,
    handleGenerate,
    handleStop,
    combinedOutput,
    copied,
    handleCopy,
    handleDownload,
    justSaved,
    runCompleted,
    elapsed,
    elapsedLabel,
    doneCount,
    activeStep,
    // deliverable
    deliverable,
    deliverableContent,
    deliverableStatus,
    deliverableError,
    deliverableTruncated,
    deliverableNotes,
    deliverableCopied,
    handleDeliverableCopy,
    handleDeliverableDownload,
    // lifecycle
    resetFlow,
    hasActiveFlow,
    // live-run map model
    involvedPaths,
    activePath,
    handoff,
    nodeStatus,
  };
}

export type GenerationController = ReturnType<typeof useGeneration>;
