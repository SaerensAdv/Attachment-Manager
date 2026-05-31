import { getDocFile } from "./docs";

export interface IntakeField {
  /** Stable key, lowercase snake/kebab (e.g. "budget", "locaties"). */
  key: string;
  /** Short Dutch label shown above the input. */
  label: string;
  /** One short Dutch sentence explaining what to provide. */
  hint: string;
  /** A concrete Dutch example value to guide the user. */
  example: string;
}

export const INTAKE_SCHEMA_HINT = `{
  "fields": [
    { "key": string, "label": string, "hint": string, "example": string }
  ]
}`;

/**
 * Build the prompt that detects which ESSENTIAL inputs are still missing for the
 * chosen agent/workflow, given the request and the client context. The agent
 * docs declare a "Required input" section; the model compares that against what
 * the request and client profile already provide and asks only for real gaps —
 * so the specialist never has to guess critical setup details.
 */
export function buildIntakePrompt(params: {
  agentPath: string;
  workflowPath: string | null;
  clientPath: string;
}): string {
  const agent = getDocFile(params.agentPath);
  const workflow = params.workflowPath ? getDocFile(params.workflowPath) : null;
  const client = getDocFile(params.clientPath);

  return [
    "Je bent de intake-assistent van het AI-team van Saerens Advertising (een Belgisch Google Ads-bureau).",
    "Een opdracht is al toegewezen aan een specialist en workflow. Jouw enige taak: bepaal welke ESSENTIËLE invoer nog ontbreekt zodat de specialist niets hoeft te gokken.",
    "",
    "## Rol van de gekozen specialist",
    agent ? agent.content.trim() : "(onbekend)",
    "",
    "## Workflow",
    workflow ? workflow.content.trim() : "(geen specifieke workflow)",
    "",
    "## Klantcontext (kan al antwoorden bevatten)",
    client ? client.content.trim() : "(geen klantcontext)",
    "",
    "## Regels",
    "- Baseer je op de 'Required input' / vereiste invoer van de specialist en de behoeften van de workflow.",
    "- Vraag ENKEL naar gegevens die (a) echt essentieel zijn voor deze opdracht én (b) NIET al blijken uit de opdracht van de gebruiker of de klantcontext hierboven.",
    "- Staat een gegeven al in de klantcontext (bv. locaties, budgetrange, taal, diensten)? Vraag er dan NIET naar.",
    "- Vraag nooit naar nice-to-have of creatieve invulling — die mag de specialist zelf voorstellen.",
    "- Hou het kort: maximaal 5 velden, alleen de echt blokkerende gaten. Als er niets essentieels ontbreekt, geef een lege lijst terug.",
    "- 'label', 'hint' en 'example' in het Nederlands (Vlaams). 'key' in lowercase zonder spaties.",
    "",
    "Antwoord met UITSLUITEND geldige JSON volgens dit schema, zonder extra tekst of markdown:",
    INTAKE_SCHEMA_HINT,
  ].join("\n");
}

/** Tolerantly extract the JSON object from a model response. */
export function parseIntakeJson(text: string): Record<string, unknown> {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Geen JSON gevonden in intake-antwoord.");
  }
  return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
}
