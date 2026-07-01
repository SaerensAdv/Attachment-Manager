import { anthropic } from "@workspace/integrations-anthropic-ai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  clientsTable,
  type Generation,
  type ImprovementProposal,
} from "@workspace/db";
import { getDocsRoot, listDocFiles } from "./docs";
import {
  loadClientDocs,
  isDbClientPath,
  dbClientIdFromPath,
} from "./clients-store";
import { listAcceptedProposals } from "./proposals-store";
import { recordAlert } from "./alerts-store";
import { logger } from "./logger";

/** Heading for the non-destructive, agent-managed "learned rules" section. */
const MANAGED_SECTION = "## Geleerde regels (uit reviews)";

/** Cap the generated output we send to the model, to keep prompts bounded. */
const MAX_OUTPUT_CHARS = 6000;

/** A doc improvement the model proposes; not yet persisted or applied. */
export interface ProposalDraft {
  targetType: "knowledge" | "client";
  targetPath: string;
  targetLabel: string;
  rationale: string;
  proposedText: string;
}

function buildSystemPrompt(): string {
  return [
    "Je bent de kwaliteitsbewaker van het AI-team van Saerens Advertising, een Belgisch Google Ads-bureau.",
    "Een mens — de enige kwaliteitscontrole — heeft zojuist een gegenereerd resultaat beoordeeld.",
    "Jouw taak: vertaal die beoordeling naar concrete, blijvende verbeteringen aan de documentatie,",
    "zodat het team deze correctie of voorkeur voortaan automatisch toepast.",
    "",
    "Regels:",
    "- Stel 0 tot 3 voorstellen voor. Liever geen voorstel dan een vaag, dubbel of overbodig voorstel.",
    "- Stel enkel iets voor als de feedback een duidelijke, herbruikbare les bevat.",
    "- Gebruik targetType \"knowledge\" wanneer de les voor alle klanten geldt.",
    "- Gebruik targetType \"client\" wanneer de les enkel voor deze specifieke klant geldt.",
    '- "proposedText" is de exacte tekst die als nieuwe richtlijn wordt toegevoegd: kort, concreet, in het Nederlands, als imperatieve regel. Geen emoji\'s.',
    '- "rationale" legt in één zin uit waarom deze wijziging volgt uit de feedback.',
    "- Verzin geen documenten: targetPath moet exact één van de toegestane paden zijn.",
    "",
    'Antwoord uitsluitend met geldige JSON in de vorm: {"proposals":[{"targetType":"knowledge|client","targetPath":"...","targetLabel":"...","rationale":"...","proposedText":"..."}]}',
    "Geen tekst buiten de JSON.",
  ].join("\n");
}

interface AllowedTargets {
  knowledge: { path: string; label: string }[];
  client: { path: string; label: string } | null;
}

async function collectTargets(generation: Generation): Promise<AllowedTargets> {
  const clientDocs = await loadClientDocs();
  const docs = listDocFiles(clientDocs);
  const knowledge = docs
    .filter((d) => d.category === "knowledge")
    .map((d) => ({ path: d.path, label: d.title }));
  const clientDoc = docs.find((d) => d.path === generation.clientPath) ?? null;
  const client = clientDoc
    ? { path: clientDoc.path, label: clientDoc.title }
    : null;
  return { knowledge, client };
}

function buildUserPrompt(
  generation: Generation,
  targets: AllowedTargets,
): string {
  const knowledgeList = targets.knowledge
    .map((k) => `- ${k.path} — ${k.label}`)
    .join("\n");
  const clientLine = targets.client
    ? `- ${targets.client.path} — ${targets.client.label}`
    : "(geen klantdocument beschikbaar; stel enkel knowledge-voorstellen voor)";
  const output =
    generation.finalMarkdown.length > MAX_OUTPUT_CHARS
      ? generation.finalMarkdown.slice(0, MAX_OUTPUT_CHARS) + "\n[...ingekort...]"
      : generation.finalMarkdown;

  return [
    "TOEGESTANE KNOWLEDGE-DOCUMENTEN (algemene standaarden):",
    knowledgeList || "(geen)",
    "",
    "TOEGESTAAN KLANTDOCUMENT (klantspecifiek):",
    clientLine,
    "",
    `OPDRACHT:\n${generation.requestText}`,
    "",
    `GEGENEREERD RESULTAAT:\n${output}`,
    "",
    "BEOORDELING DOOR DE MENS:",
    `Oordeel: ${generation.feedbackVerdict ?? "(geen)"}`,
    `Opmerking/correctie: ${generation.feedbackNote?.trim() || "(geen)"}`,
  ].join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Geen JSON-object gevonden in het antwoord.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Ask the model to turn a human verdict/correction into 0..3 concrete doc
 * improvements. Drafts are validated against the allowed targets so the model
 * cannot invent files; persistence happens in the route layer.
 */
export async function generateProposals(
  generation: Generation,
): Promise<ProposalDraft[]> {
  const targets = await collectTargets(generation);
  const allowedKnowledge = new Map(targets.knowledge.map((k) => [k.path, k.label]));

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(generation, targets) }],
  });
  const raw = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");

  const parsed = parseJsonObject(raw);
  const list = Array.isArray(parsed.proposals) ? parsed.proposals : [];

  const drafts: ProposalDraft[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const targetPath = asText(obj.targetPath);
    const rationale = asText(obj.rationale);
    const proposedText = asText(obj.proposedText);
    if (!targetPath || !rationale || !proposedText) continue;

    if (targets.client && targetPath === targets.client.path) {
      drafts.push({
        targetType: "client",
        targetPath,
        targetLabel: targets.client.label,
        rationale,
        proposedText,
      });
    } else if (allowedKnowledge.has(targetPath)) {
      drafts.push({
        targetType: "knowledge",
        targetPath,
        targetLabel: allowedKnowledge.get(targetPath) ?? targetPath,
        rationale,
        proposedText,
      });
    }
    if (drafts.length >= 3) break;
  }
  return drafts;
}

/**
 * Result of applying a rule. `changed` is true when this call actually wrote the
 * rule, false when it was already present (the apply is idempotent). The route
 * uses it to tell the operator "toegevoegd" vs "stond er al".
 */
export interface ApplyResult {
  changed: boolean;
}

/** Resolve + guard a doc path to an absolute .md path inside the docs root. */
function resolveDocPath(targetPath: string): string {
  const root = getDocsRoot();
  const abs = resolve(root, targetPath);
  if (!abs.startsWith(resolve(root) + "/") || !abs.endsWith(".md")) {
    throw new Error("Ongeldig documentpad voor deze verbetering.");
  }
  return abs;
}

async function applyToClient(
  clientId: number,
  proposedText: string,
): Promise<ApplyResult> {
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  if (!client) {
    throw new Error("Klant niet gevonden voor deze verbetering.");
  }
  const existing = client.restrictions?.trim() ?? "";
  const addition = proposedText.trim();
  if (existing.includes(addition)) return { changed: false };
  const next = existing ? `${existing}\n${addition}` : addition;
  await db
    .update(clientsTable)
    .set({ restrictions: next, updatedAt: new Date() })
    .where(eq(clientsTable.id, clientId));
  return { changed: true };
}

function applyToFile(targetPath: string, proposedText: string): ApplyResult {
  const abs = resolveDocPath(targetPath);
  if (!existsSync(abs)) {
    throw new Error("Doeldocument bestaat niet meer.");
  }
  const content = readFileSync(abs, "utf8");
  const bullet = `- ${proposedText.trim()}`;
  if (content.includes(bullet)) return { changed: false };
  const trimmed = content.replace(/\s+$/, "");
  const next = trimmed.includes(MANAGED_SECTION)
    ? `${trimmed}\n${bullet}\n`
    : `${trimmed}\n\n${MANAGED_SECTION}\n\n${bullet}\n`;
  writeFileSync(abs, next, "utf8");
  return { changed: true };
}

/**
 * Apply an accepted proposal non-destructively: DB clients get the rule
 * appended to their restrictions field; knowledge/file docs get it appended as
 * a bullet under a managed "Geleerde regels" section. Returns whether this call
 * actually changed anything (vs the rule already being present).
 */
export async function applyProposal(
  proposal: ImprovementProposal,
): Promise<ApplyResult> {
  if (isDbClientPath(proposal.targetPath)) {
    const id = dbClientIdFromPath(proposal.targetPath);
    if (id === null) throw new Error("Ongeldig klantpad voor deze verbetering.");
    return applyToClient(id, proposal.proposedText);
  }
  return applyToFile(proposal.targetPath, proposal.proposedText);
}

/**
 * Honest double-check that an accepted proposal's rule is *actually* present in
 * its target right now — re-reads the on-disk doc (or the client's restrictions
 * in the DB) instead of trusting that the apply write succeeded. Best-effort and
 * never throws: any read error or a since-deleted target reads as not present,
 * so the accept route can report "toegepast, niet kunnen bevestigen" rather than
 * crash. This is what backs the operator-facing "bevestigd in het document".
 */
export async function verifyProposalApplied(
  proposal: ImprovementProposal,
): Promise<{ present: boolean }> {
  try {
    const needle = proposal.proposedText.trim();
    if (!needle) return { present: false };
    if (isDbClientPath(proposal.targetPath)) {
      const id = dbClientIdFromPath(proposal.targetPath);
      if (id === null) return { present: false };
      const [client] = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, id));
      const restrictions = client?.restrictions ?? "";
      return { present: restrictions.includes(needle) };
    }
    const abs = resolveDocPath(proposal.targetPath);
    if (!existsSync(abs)) return { present: false };
    const content = readFileSync(abs, "utf8");
    return { present: content.includes(`- ${needle}`) };
  } catch {
    return { present: false };
  }
}

/**
 * Re-apply every accepted KNOWLEDGE (file-based) learned rule onto the on-disk
 * docs. Meant to run once at startup.
 *
 * Why: a redeploy rebuilds knowledge/*.md from the repo, wiping the
 * non-destructive "Geleerde regels" bullets the learning loop appended at
 * runtime. Client-target rules live in the DB (clients.restrictions) and already
 * survive; only file-target rules need replaying. `applyToFile` is idempotent
 * (it skips a bullet that's already present), so running this on every boot is
 * safe and converges each doc to "repo content + every accepted rule".
 *
 * Best-effort by contract: a single bad proposal (e.g. its target doc was later
 * removed from the repo) must never block startup, so every proposal is applied
 * inside its own try/catch and a DB read failure degrades to a no-op. Returns a
 * small summary for the startup log line.
 */
export async function reapplyAcceptedFileProposals(): Promise<{
  applied: number;
  skipped: number;
}> {
  let proposals: ImprovementProposal[];
  try {
    proposals = await listAcceptedProposals();
  } catch (err) {
    logger.warn(
      { err },
      "Geleerde regels herstellen overgeslagen: voorstellen niet leesbaar",
    );
    return { applied: 0, skipped: 0 };
  }

  let applied = 0;
  let skipped = 0;
  for (const proposal of proposals) {
    // Only file-based knowledge rules are lost on redeploy; client rules persist
    // in the DB. The isDbClientPath guard is belt-and-suspenders next to the
    // targetType check.
    if (proposal.targetType !== "knowledge") continue;
    if (isDbClientPath(proposal.targetPath)) continue;
    try {
      applyToFile(proposal.targetPath, proposal.proposedText);
      applied++;
    } catch (err) {
      skipped++;
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err, targetPath: proposal.targetPath, proposalId: proposal.id },
        "Geleerde regel niet hersteld: doeldocument ontbreekt of is onleesbaar",
      );
      // Surface the orphaned rule in the "Te doen" overview: an accepted rule
      // whose target doc was later removed silently drops out of effect, which
      // the operator otherwise never sees. Best-effort; dedup per target path.
      await recordAlert({
        source: "learning-loop",
        severity: "warn",
        message: `Geleerde regel niet toegepast: doeldocument '${proposal.targetPath}' bestaat niet meer`,
        context: {
          key: proposal.targetPath,
          proposalId: proposal.id,
          targetPath: proposal.targetPath,
          detail,
        },
      });
    }
  }
  return { applied, skipped };
}
