export interface IntakeField {
  key: string;
  label: string;
  hint: string;
  example: string;
}

/**
 * After routing is confirmed, ask the backend which essential inputs are still
 * missing for the chosen agent/workflow so the user can fill them before the
 * specialist generates — preventing the model from guessing critical details.
 */
export async function fetchIntake(
  payload: {
    agentPath: string;
    workflowPath: string | null;
    clientPath: string;
    request: string;
  },
  signal?: AbortSignal,
): Promise<IntakeField[]> {
  const res = await fetch("/api/intake", {
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

  const data = (await res.json()) as { fields?: IntakeField[] };
  return Array.isArray(data.fields) ? data.fields : [];
}
