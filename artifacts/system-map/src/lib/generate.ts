export interface GeneratePayload {
  agentPath: string;
  additionalAgentPaths: string[];
  clientPath: string;
  workflowPath: string;
  request: string;
  /** Optional parallel-execution plan: groups of agent paths that may run together. */
  stages?: string[][];
  /** Whether the team's output is client-facing (drives the humanizer QC pass). */
  clientFacing?: boolean;
  /** Whether the request touches a live account (surfaced as a run note). */
  touchesLiveAccount?: boolean;
  /**
   * Override the number of creative variations the lead fans out into for this
   * run. Omit to use the workflow's marker default; a value below 2 switches
   * fan-out off. The server clamps it to the MAX_FANOUT safety cap.
   */
  fanout?: number;
}

export interface AgentStartInfo {
  index: number;
  total: number;
  agent: { path: string; title: string };
  role: "lead" | "member" | "quality";
}

/** An agent's parsed internal handoff brief, surfaced live as a step completes. */
export interface AgentBrief {
  decisions: string[];
  keyFacts: string[];
  openQuestions: string[];
  forNext: string | null;
  clientFacing: boolean | null;
  touchesLiveAccount: boolean | null;
}

export interface PlanMember {
  index: number;
  path: string;
  title: string;
  role: "lead" | "member";
  stage: number;
}

export interface PlanQcStep {
  index: number;
  path: string;
  title: string;
  mode: "humanizer" | "reviewer";
}

/** The full run plan announced once up front, before any agent starts. */
export interface PlanInfo {
  total: number;
  clientFacing: boolean;
  touchesLiveAccount: boolean;
  members: PlanMember[];
  qc: PlanQcStep[];
}

export interface DeliverableMeta {
  kind: string;
  title: string;
  note: string;
  filename: string;
  mimeType: string;
  format: "text" | "binary";
}

export interface TeamStreamHandlers {
  /** Fired once before any agent runs, with the full plan (stages + QC steps). */
  onPlan?: (plan: PlanInfo) => void;
  onAgentStart: (info: AgentStartInfo) => void;
  onDelta: (index: number, text: string) => void;
  onAgentDone: (index: number, truncated: boolean) => void;
  /** Fired when an agent's parsed handoff brief becomes available mid-run. */
  onAgentBrief?: (index: number, brief: AgentBrief) => void;
  onDeliverableStart?: (meta: DeliverableMeta) => void;
  onDeliverableDelta?: (text: string) => void;
  onDeliverableDone?: (truncated: boolean) => void;
  onDeliverableError?: (message: string) => void;
  /** Non-blocking notes (e.g. live data unavailable, so the file used fallbacks). */
  onDeliverableNote?: (message: string) => void;
  /**
   * A client-facing deliverable was drafted but is HELD for human approval
   * before it reaches the client. Carries the held draft + the internal reviewer
   * verdict so the UI can present an approve / request-changes decision.
   */
  onApprovalRequired?: (info: ApprovalRequiredInfo) => void;
  /**
   * A fan-out lead step finished: every usable creative variation plus the
   * selector's rationale (winner flagged), so the run view can show the
   * alternatives next to the auto-chosen winner.
   */
  onFanoutCandidates?: (info: FanoutCandidatesInfo) => void;
  onDone: (archived: boolean, info: DoneInfo) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

/** The held draft surfaced when a client-facing run needs human approval. */
export interface ApprovalRequiredInfo {
  recipient: string;
  clientReport: string;
  reviewerVerdict: string | null;
}

/** One creative variation produced by a fan-out lead step. */
export interface FanoutCandidate {
  variant: number;
  text: string;
  status: string;
  winner: boolean;
  // Brief reason this variation lost (empty for the winner / when not captured).
  reason?: string;
}

/**
 * The fan-out result surfaced live: every usable creative variation that was
 * generated plus the selector's rationale, with the winning variant flagged.
 */
export interface FanoutCandidatesInfo {
  rationale: string;
  candidates: FanoutCandidate[];
}

/** Extra context carried by the terminal `done` event. */
export interface DoneInfo {
  generationId: number | null;
  approvalRequired: boolean;
}

interface StreamEvent {
  type?:
    | "plan"
    | "agent_start"
    | "agent_done"
    | "agent_brief"
    | "deliverable_start"
    | "deliverable_delta"
    | "deliverable_done"
    | "deliverable_error"
    | "deliverable_note"
    | "approval_required"
    | "fanout_candidates";
  index?: number;
  total?: number;
  agent?: { path: string; title: string };
  role?: "lead" | "member" | "quality";
  deliverable?: DeliverableMeta;
  content?: string;
  message?: string;
  truncated?: boolean;
  done?: boolean;
  archived?: boolean;
  error?: string;
  clientFacing?: boolean;
  touchesLiveAccount?: boolean;
  members?: PlanMember[];
  qc?: PlanQcStep[];
  generationId?: number | null;
  approvalRequired?: boolean;
  recipient?: string;
  clientReport?: string;
  reviewerVerdict?: string | null;
  brief?: Partial<AgentBrief> & { agent?: string };
  rationale?: string;
  candidates?: FanoutCandidate[];
}

/**
 * POST to the SSE generate endpoint and parse `data: {...}` events from the
 * streamed response body. The team runs sequentially: each agent emits an
 * `agent_start`, then `content` deltas, then `agent_done`. Orval cannot generate
 * a usable client for SSE, so we consume the stream manually with fetch.
 */
export async function streamGenerateTeam(
  payload: GeneratePayload,
  handlers: TeamStreamHandlers,
): Promise<void> {
  const {
    onPlan,
    onAgentStart,
    onDelta,
    onAgentDone,
    onAgentBrief,
    onDeliverableStart,
    onDeliverableDelta,
    onDeliverableDone,
    onDeliverableError,
    onDeliverableNote,
    onApprovalRequired,
    onFanoutCandidates,
    onDone,
    onError,
    signal,
  } = handlers;

  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Netwerkfout");
    return;
  }

  if (!res.ok || !res.body) {
    let message = `Serverfout (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors, keep generic message
    }
    onError(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentIndex = 0;
  // Only an explicit `{ done: true }` event counts as success. If the socket
  // closes before that (e.g. a mid-chain server failure), surface an error
  // instead of falsely reporting completion.
  let seenDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const line = event.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          const parsed = JSON.parse(json) as StreamEvent;
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
          if (parsed.done) {
            seenDone = true;
            onDone(parsed.archived === true, {
              generationId:
                typeof parsed.generationId === "number"
                  ? parsed.generationId
                  : null,
              approvalRequired: parsed.approvalRequired === true,
            });
            return;
          }
          if (parsed.type === "plan") {
            onPlan?.({
              total: parsed.total ?? 0,
              clientFacing: parsed.clientFacing === true,
              touchesLiveAccount: parsed.touchesLiveAccount === true,
              members: Array.isArray(parsed.members) ? parsed.members : [],
              qc: Array.isArray(parsed.qc) ? parsed.qc : [],
            });
            continue;
          }
          if (parsed.type === "agent_start" && parsed.agent) {
            currentIndex = parsed.index ?? currentIndex;
            onAgentStart({
              index: parsed.index ?? 0,
              total: parsed.total ?? 1,
              agent: parsed.agent,
              role: parsed.role ?? "member",
            });
            continue;
          }
          if (parsed.type === "agent_done") {
            onAgentDone(parsed.index ?? currentIndex, parsed.truncated === true);
            continue;
          }
          if (parsed.type === "agent_brief" && parsed.brief) {
            const b = parsed.brief;
            onAgentBrief?.(parsed.index ?? currentIndex, {
              decisions: Array.isArray(b.decisions) ? b.decisions : [],
              keyFacts: Array.isArray(b.keyFacts) ? b.keyFacts : [],
              openQuestions: Array.isArray(b.openQuestions)
                ? b.openQuestions
                : [],
              forNext: typeof b.forNext === "string" ? b.forNext : null,
              clientFacing:
                typeof b.clientFacing === "boolean" ? b.clientFacing : null,
              touchesLiveAccount:
                typeof b.touchesLiveAccount === "boolean"
                  ? b.touchesLiveAccount
                  : null,
            });
            continue;
          }
          if (parsed.type === "deliverable_start" && parsed.deliverable) {
            onDeliverableStart?.(parsed.deliverable);
            continue;
          }
          if (parsed.type === "deliverable_delta") {
            if (typeof parsed.content === "string") {
              onDeliverableDelta?.(parsed.content);
            }
            continue;
          }
          if (parsed.type === "deliverable_done") {
            onDeliverableDone?.(parsed.truncated === true);
            continue;
          }
          if (parsed.type === "deliverable_error") {
            onDeliverableError?.(parsed.message ?? "Onbekende fout");
            continue;
          }
          if (parsed.type === "deliverable_note") {
            if (typeof parsed.message === "string" && parsed.message.trim()) {
              onDeliverableNote?.(parsed.message.trim());
            }
            continue;
          }
          if (parsed.type === "approval_required") {
            onApprovalRequired?.({
              recipient:
                typeof parsed.recipient === "string" ? parsed.recipient : "",
              clientReport:
                typeof parsed.clientReport === "string"
                  ? parsed.clientReport
                  : "",
              reviewerVerdict:
                typeof parsed.reviewerVerdict === "string"
                  ? parsed.reviewerVerdict
                  : null,
            });
            continue;
          }
          if (parsed.type === "fanout_candidates") {
            if (Array.isArray(parsed.candidates)) {
              onFanoutCandidates?.({
                rationale:
                  typeof parsed.rationale === "string" ? parsed.rationale : "",
                candidates: parsed.candidates.filter(
                  (c): c is FanoutCandidate =>
                    !!c && typeof c.text === "string" && c.text.trim().length > 0,
                ),
              });
            }
            continue;
          }
          if (typeof parsed.content === "string") {
            onDelta(parsed.index ?? currentIndex, parsed.content);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    if (seenDone) {
      onDone(false, { generationId: null, approvalRequired: false });
    } else {
      onError("Stream onverwacht beëindigd");
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Streamfout");
  }
}
