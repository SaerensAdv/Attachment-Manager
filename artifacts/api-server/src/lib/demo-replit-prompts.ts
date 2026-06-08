/**
 * One-off DEMONSTRATION routine (temporary, dev-only).
 *
 * Generates the `replit-prompt` deliverable (workflows/web-build.md) across
 * several different build scenarios so we can see what each Replit build prompt
 * looks like: a new site from scratch, a redesign, an animation, a slide deck,
 * and an ad-creatives set.
 *
 * Safety: works from the mock fiche only (no live account, nothing sent). Runs
 * inside the persistent api-server process (fire-and-forget from a dev route)
 * because long team runs outlive a shell/background process. Output goes to
 * .local/exports/demo-prompts/. Not part of the product; removed after capture.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGenerationContext, runGeneration } from "./generate-engine";
import { dbClientPath } from "./clients-store";

const OUT = "/home/runner/workspace/.local/exports/demo-prompts";
const CLIENT_NAME = "ZZ Demo Warmtepomp (test)";

async function log(msg: string): Promise<void> {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  await appendFile(`${OUT}/_run.log`, line).catch(() => {});
}

const MOCK_CURRENT_STATE = `LET OP: dit is een DEMO/test-klant met verzonnen cijfers — niets hiervan is live.

Merk en aanbod (testdata):
- Vlaams installatiebedrijf voor lucht-water- en hybride warmtepompen bij particulieren.
- Diensten: lucht-water warmtepomp, hybride warmtepomp, plaatsing/installatie, onderhoud en service.
- USP's: erkend/gecertificeerd installateur, transparante prijzen, begeleiding bij Mijn VerbouwPremie, eerlijk advies, snelle offerte.
- Belangrijke pagina's: /lucht-water-warmtepomp, /hybride-warmtepomp, /onderhoud, /offerte.
- Doel van de site: offerte-aanvragen (leads) genereren.
- Merkrestricties: geen overdreven of misleidende claims; subsidiebedragen nooit garanderen; wij doen geen airco-installatie.`;

interface RunSpec {
  key: string;
  label: string;
  agentPath: string;
  additional: string[];
  stages: string[][];
  request: string;
}

async function getOrCreateClient(): Promise<{ id: number; name: string }> {
  const existing = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.name, CLIENT_NAME))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, name: existing[0].name };

  const [client] = await db
    .insert(clientsTable)
    .values({
      name: CLIENT_NAME,
      business:
        "Vlaams installatiebedrijf dat lucht-water- en hybride warmtepompen verkoopt en plaatst bij particulieren.",
      world:
        "Energierenovatie en verduurzaming van woningen. Klanten vergelijken aanbieders en letten op subsidies en vertrouwen.",
      services:
        "Lucht-water warmtepompen\nHybride warmtepompen\nPlaatsing en installatie\nOnderhoud en service",
      audience: "Huiseigenaren in Vlaanderen, 35-65 jaar die hun woning verduurzamen",
      locations: "Vlaanderen (Antwerpen, Oost-Vlaanderen, Vlaams-Brabant)",
      languages: "Nederlands (BE)",
      mainGoal: "Meer gekwalificeerde offerte-aanvragen (leads).",
      conversionAction: "Offerte-aanvraag via het formulier op de website.",
      toneOfVoice:
        "Deskundig en geruststellend, helder en zonder jargon. Geen overdreven beloftes.",
      channels: "Google Ads (Search)\nGoogle Business Profile",
      restrictions:
        "Geen overdreven of misleidende claims. Subsidiebedragen nooit garanderen. Wij doen geen airco-installatie.",
      website: "https://demo-warmtepomp.test",
      landingPages:
        "https://demo-warmtepomp.test/lucht-water-warmtepomp, https://demo-warmtepomp.test/offerte",
      currentState: MOCK_CURRENT_STATE,
      reportEmail: "demo@voorbeeld.test",
    })
    .returning();
  return { id: client.id, name: client.name };
}

/** Run the replit-prompt demonstration. Best-effort; never throws to caller. */
export async function runReplitPromptDemo(): Promise<void> {
  try {
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/_run.log`, "");
    await log("Start replit-prompt demo");

    const client = await getOrCreateClient();
    const clientPath = dbClientPath(client.id);
    await log(`Client #${client.id} -> ${clientPath}`);

    const runs: RunSpec[] = [
      {
        key: "1-website-scratch",
        label: "Nieuwe website van scratch",
        agentPath: "agents/web-developer.md",
        additional: ["agents/landing-page-specialist.md", "agents/copywriter.md"],
        stages: [
          ["agents/landing-page-specialist.md", "agents/copywriter.md"],
          ["agents/web-developer.md"],
        ],
        request:
          "Bouw een volledig nieuwe, conversiegerichte website van scratch voor deze klant: home, dienstenpagina's (lucht-water, hybride, onderhoud), over-ons en een offerte-aanvraagpagina. Mobile-first, snel, toegankelijk en on-brand, met een offerteformulier als centrale conversie. Lever het eindproduct als een Replit-bouwprompt.",
      },
      {
        key: "2-redesign",
        label: "Redesign bestaande landingspagina",
        agentPath: "agents/web-developer.md",
        additional: ["agents/cro-specialist.md"],
        stages: [["agents/cro-specialist.md"], ["agents/web-developer.md"]],
        request:
          "Herontwerp de bestaande landingspagina /lucht-water-warmtepomp: behoud het aanbod en de inhoud, maar verhoog de conversie (sterkere hero, vertrouwenssignalen, duidelijke CTA-flow, snellere laadtijd). Lever een Replit-bouwprompt voor de herbouw.",
      },
      {
        key: "3-animation",
        label: "Geanimeerde hero / explainer",
        agentPath: "agents/web-developer.md",
        additional: ["agents/creative-designer.md"],
        stages: [["agents/creative-designer.md"], ["agents/web-developer.md"]],
        request:
          "Maak een korte, premium geanimeerde hero/explainer voor de homepage die toont hoe een warmtepomp de woning verwarmt en bespaart — vloeiende intro- en scroll-animaties, met respect voor prefers-reduced-motion. Lever een Replit-bouwprompt.",
      },
      {
        key: "4-slide-deck",
        label: "Verkoop-/pitch slide deck",
        agentPath: "agents/web-developer.md",
        additional: ["agents/copywriter.md"],
        stages: [["agents/copywriter.md"], ["agents/web-developer.md"]],
        request:
          "Maak een verkoop-/pitchpresentatie (slide deck) waarmee Saerens deze klant overtuigt van een Google Ads-aanpak: probleem, aanpak, verwachte resultaten, prijs en volgende stappen. Lever een Replit-bouwprompt om het deck te bouwen.",
      },
      {
        key: "5-ad-creatives",
        label: "Visuele advertentiecreatives (set)",
        agentPath: "agents/web-developer.md",
        additional: ["agents/creative-designer.md", "agents/copywriter.md"],
        stages: [
          ["agents/creative-designer.md", "agents/copywriter.md"],
          ["agents/web-developer.md"],
        ],
        request:
          "Maak een set visuele advertentiecreatives (Meta/Display) voor de warmtepompcampagne: meerdere formaten en hooks rond besparing, subsidie en vertrouwen. Lever een Replit-bouwprompt om een creatives-set met previews te bouwen.",
      },
    ];

    for (const r of runs) {
      await log(`RUN ${r.key} (${r.label}) starting`);
      let deliverableText = "";
      const controller = new AbortController();
      const sink = (e: unknown): void => {
        const ev = (e ?? {}) as Record<string, unknown>;
        const type = ev.type;
        if (type === "deliverable_delta") {
          deliverableText += (ev.content as string) ?? "";
        } else if (type === "deliverable_error") {
          void log(`  deliverable_error: ${String(ev.message)}`);
        } else if (type === "deliverable_note") {
          void log(`  deliverable_note: ${String(ev.message)}`);
        }
      };

      const resolved = await resolveGenerationContext({
        agentPath: r.agentPath,
        additionalAgentPaths: r.additional,
        stages: r.stages,
        workflowPath: "workflows/web-build.md",
        clientPath,
        request: r.request,
        clientFacing: false,
        touchesLiveAccount: false,
        qcEnabled: false,
      });
      if (!resolved.ok) {
        await log(`  RESOLVE FAILED: ${resolved.error}`);
        continue;
      }

      try {
        const result = await runGeneration(resolved.ctx, {
          sink,
          signal: controller.signal,
          triggerSource: "user",
        });
        await writeFile(`${OUT}/${r.key}.team.md`, result.finalMarkdown ?? "");
        if (deliverableText.trim()) {
          await writeFile(
            `${OUT}/${r.key}.replit-prompt.md`,
            deliverableText.trim() + "\n",
          );
        }
        await log(
          `  DONE ${r.key} status=${result.status} promptChars=${deliverableText.length}`,
        );
      } catch (err) {
        await log(
          `  ERROR ${r.key}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
      }
    }

    await log("ALL DONE");
    await writeFile(`${OUT}/_DONE`, "ok\n");
  } catch (e) {
    await log(`FATAL: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  }
}
