export interface GeneratePayload {
  agentPath: string;
  additionalAgentPaths: string[];
  clientPath: string;
  workflowPath: string;
  request: string;
}

export interface AgentStartInfo {
  index: number;
  total: number;
  agent: { path: string; title: string };
  role: "lead" | "member";
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
  onAgentStart: (info: AgentStartInfo) => void;
  onDelta: (index: number, text: string) => void;
  onAgentDone: (index: number, truncated: boolean) => void;
  onDeliverableStart?: (meta: DeliverableMeta) => void;
  onDeliverableDelta?: (text: string) => void;
  onDeliverableDone?: (truncated: boolean) => void;
  onDeliverableError?: (message: string) => void;
  /** Non-blocking notes (e.g. live data unavailable, so the file used fallbacks). */
  onDeliverableNote?: (message: string) => void;
  onDone: (archived: boolean) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

interface StreamEvent {
  type?:
    | "agent_start"
    | "agent_done"
    | "deliverable_start"
    | "deliverable_delta"
    | "deliverable_done"
    | "deliverable_error"
    | "deliverable_note";
  index?: number;
  total?: number;
  agent?: { path: string; title: string };
  role?: "lead" | "member";
  deliverable?: DeliverableMeta;
  content?: string;
  message?: string;
  truncated?: boolean;
  done?: boolean;
  archived?: boolean;
  error?: string;
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
    onAgentStart,
    onDelta,
    onAgentDone,
    onDeliverableStart,
    onDeliverableDelta,
    onDeliverableDone,
    onDeliverableError,
    onDeliverableNote,
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
            onDone(parsed.archived === true);
            return;
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
          if (typeof parsed.content === "string") {
            onDelta(parsed.index ?? currentIndex, parsed.content);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    if (seenDone) {
      onDone(false);
    } else {
      onError("Stream onverwacht beëindigd");
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Streamfout");
  }
}
