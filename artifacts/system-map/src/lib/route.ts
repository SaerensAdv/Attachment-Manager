export interface RoutingChoiceDTO {
  path: string;
  title: string;
}

/** The Orchestrator's proposed execution plan, grouped into parallel stages. */
export interface RoutingPlan {
  stages: RoutingChoiceDTO[][];
  /** true = the team's output goes straight to the client (a humanizer pass runs). */
  clientFacing: boolean | null;
  /** true = the request touches live spend/tracking/accounts. */
  touchesLiveAccount: boolean;
}

export interface RoutingResult {
  needsClarification: boolean;
  clarification: string | null;
  taskType: string | null;
  reasoning: string | null;
  workflow: RoutingChoiceDTO | null;
  agent: RoutingChoiceDTO | null;
  additionalAgents: RoutingChoiceDTO[];
  plan: RoutingPlan | null;
}

/**
 * Ask the backend Orchestrator to read the request + client and decide which
 * workflow and agent should handle it. Throws on a non-OK response.
 */
export async function routeRequest(
  payload: { clientPath: string; request: string },
  signal?: AbortSignal,
): Promise<RoutingResult> {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let message = `Serverfout (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }

  return (await res.json()) as RoutingResult;
}
