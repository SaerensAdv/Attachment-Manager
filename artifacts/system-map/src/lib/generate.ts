export interface GeneratePayload {
  agentPath: string;
  clientPath: string;
  workflowPath: string;
  request: string;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * POST to the SSE generate endpoint and parse `data: {...}` events from the
 * streamed response body. Orval cannot generate a usable client for SSE, so we
 * consume the stream manually with fetch + ReadableStream.
 */
export async function streamGenerate(
  payload: GeneratePayload,
  handlers: StreamHandlers,
): Promise<void> {
  const { onDelta, onDone, onError, signal } = handlers;

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
          const parsed = JSON.parse(json) as {
            content?: string;
            done?: boolean;
            error?: string;
          };
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
          if (parsed.done) {
            onDone();
            return;
          }
          if (typeof parsed.content === "string") onDelta(parsed.content);
        } catch {
          // ignore malformed chunk
        }
      }
    }
    onDone();
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    onError(err instanceof Error ? err.message : "Streamfout");
  }
}
