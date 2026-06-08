/**
 * One-off DEMONSTRATION routine (temporary, dev-only).
 *
 * Runs the agency's real generation engine in-process against a MOCK/test client
 * so we can see what each real client deliverable actually looks like:
 *   - workflows/ad-copy.md              -> Google Ads RSA copy CSV
 *   - workflows/account-optimization.md -> negative-keywords CSV + action list
 *   - workflows/monthly-reporting.md    -> client report (markdown) + rendered PDF
 *
 * Safety: the mock client has NO googleAdsCustomerId, so every live read-only
 * fetch is skipped (the team works from the fiche only). The monthly report is
 * HELD for human approval (pendingDelivery) and is NEVER sent — this routine
 * renders the PDF locally and never calls deliverMonthlyReport / sendEmail.
 *
 * It runs inside the persistent api-server process (fire-and-forget from a dev
 * route) because long team runs outlive a shell/background process. Output is
 * written to .local/exports/demo/. This file is not part of the product and is
 * removed once the demonstration is captured.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { db, clientsTable } from "@workspace/db";
import { resolveGenerationContext, runGeneration } from "./generate-engine";
import { dbClientPath } from "./clients-store";
import { renderReportPdf } from "./report-pdf";

const OUT = "/home/runner/workspace/.local/exports/demo";

async function log(msg: string): Promise<void> {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  await appendFile(`${OUT}/_run.log`, line).catch(() => {});
}

const MOCK_CURRENT_STATE = `LET OP: dit is een DEMO/test-klant met verzonnen cijfers — niets hiervan is live.

Recente prestaties (testdata, vorige maand t.o.v. de maand ervoor):
- Investering: EUR 4.120 (vorige maand EUR 3.880, +6%)
- Leads (offerte-aanvragen): 71 (vorige maand 64, +11%)
- Kost per lead (CPL): EUR 58,03 (vorige maand EUR 60,63, -4%)
- Klikken: 1.940 | Vertoningen: 38.500 | CTR: 5,04% | Gem. CPC: EUR 2,12
- Conversieratio: 3,66%
- Zelfde maand vorig jaar: 52 leads bij CPL EUR 67,10

Per campagne (testdata, vorige maand):
- "Search - Lucht-water warmtepomp": EUR 2.560 | 47 leads | CPL EUR 54,47 | search IS 61% (verloren aan budget 22%, aan rang 17%)
- "Search - Hybride warmtepomp": EUR 1.010 | 16 leads | CPL EUR 63,13 | search IS 48% (verloren aan budget 9%, aan rang 43%)
- "Search - Merk (brand)": EUR 230 | 6 leads | CPL EUR 38,33 | search IS 88%
- "Search - Onderhoud & service": EUR 320 | 2 leads | CPL EUR 160,00 | search IS 35%

Zoektermenrapport (testdata, opvallende termen vorige maand):
- "lucht water warmtepomp prijs" — 9 leads, relevant, converteert goed
- "warmtepomp installateur antwerpen" — 7 leads, relevant
- "hybride warmtepomp subsidie 2026" — 3 leads, relevant (subsidie is een echt thema)
- "warmtepomp zelf installeren" — 0 leads, 18 klikken EUR 41 — doe-het-zelf intentie, niet relevant
- "warmtepomp tweedehands" — 0 leads, 11 klikken EUR 23 — koopt geen installatie
- "warmtepomp jobs vacature" — 0 leads, 9 klikken EUR 17 — werkzoekend, niet relevant
- "airco installateur" — 1 lead, 14 klikken EUR 33 — andere dienst, mis-gerouteerd (airco doen we niet)
- "gratis warmtepomp" — 0 leads, 7 klikken EUR 13 — onrealistische intentie
- "warmtepomp onderhoud kostprijs" — 1 lead, relevant maar in verkeerde campagne (zit in Lucht-water, hoort bij Onderhoud & service)

Accountstructuur (testdata, echte advertentiegroepen voor ad copy):
- Campagne "Search - Lucht-water warmtepomp"
  - Advertentiegroep "Lucht-water - aankoop" | thema's: lucht water warmtepomp, warmtepomp kopen, warmtepomp prijs | landingspagina: https://demo-warmtepomp.test/lucht-water-warmtepomp
  - Advertentiegroep "Lucht-water - installatie" | thema's: warmtepomp installateur, warmtepomp laten plaatsen | landingspagina: https://demo-warmtepomp.test/installatie
- Campagne "Search - Hybride warmtepomp"
  - Advertentiegroep "Hybride - algemeen" | thema's: hybride warmtepomp, warmtepomp combi cv | landingspagina: https://demo-warmtepomp.test/hybride-warmtepomp
- Campagne "Search - Onderhoud & service"
  - Advertentiegroep "Onderhoud" | thema's: warmtepomp onderhoud, warmtepomp service | landingspagina: https://demo-warmtepomp.test/onderhoud

Wat speelde er deze periode (testdata): in week 2 het maandbudget met 10% verhoogd op de lucht-water campagne; geen tracking-wijzigingen.`;

interface RunSpec {
  key: string;
  ext: string;
  workflowPath: string;
  agentPath: string;
  additional: string[];
  stages: string[][];
  request: string;
  clientFacing: boolean;
  touchesLiveAccount: boolean;
}

/** Run the full demonstration. Best-effort; never throws to the caller. */
export async function runDemo(): Promise<void> {
  try {
    await mkdir(OUT, { recursive: true });
    await writeFile(`${OUT}/_run.log`, "");
    if (await fileExists(`${OUT}/_DONE`)) {
      await writeFile(`${OUT}/_DONE`, "").catch(() => {});
    }
    await log("Start demo-deliverables run");

    const [client] = await db
      .insert(clientsTable)
      .values({
        name: "ZZ Demo Warmtepomp (test)",
        business:
          "Vlaams installatiebedrijf dat lucht-water- en hybride warmtepompen verkoopt en plaatst bij particulieren.",
        world:
          "Energierenovatie en verduurzaming van woningen. Klanten vergelijken aanbieders, letten op subsidies (Mijn VerbouwPremie) en kiezen op vertrouwen en referenties.",
        services:
          "Lucht-water warmtepompen\nHybride warmtepompen\nPlaatsing en installatie\nOnderhoud en service",
        audience:
          "Huiseigenaren in Vlaanderen, 35-65 jaar\nMensen die hun woning verduurzamen of gas vervangen\nVerbouwers en renovatieklanten",
        locations: "Vlaanderen (focus Antwerpen, Oost-Vlaanderen, Vlaams-Brabant)",
        languages: "Nederlands (BE)",
        mainGoal:
          "Meer gekwalificeerde offerte-aanvragen (leads) tegen een houdbare kost per lead.",
        conversionAction: "Offerte-aanvraag via het formulier op de website.",
        kpis: "Doel CPL onder EUR 55. Mikpunt 80 leads per maand.",
        budget: "Ongeveer EUR 4.000 per maand over alle zoekcampagnes.",
        toneOfVoice:
          "Deskundig en geruststellend, helder en zonder jargon. Geen overdreven beloftes; eerlijk over kosten en subsidies.",
        channels: "Google Ads (Search)\nGoogle Business Profile",
        restrictions:
          "Geen overdreven of misleidende claims. Subsidiebedragen nooit garanderen (afhankelijk van dossier). Wij doen geen airco-installatie.",
        website: "https://demo-warmtepomp.test",
        landingPages:
          "https://demo-warmtepomp.test/lucht-water-warmtepomp, https://demo-warmtepomp.test/offerte",
        currentState: MOCK_CURRENT_STATE,
        reportEmail: "demo@voorbeeld.test",
        // googleAdsCustomerId intentionally left unset -> no live fetches.
      })
      .returning();

    const clientPath = dbClientPath(client.id);
    await log(
      `Mock client #${client.id} -> ${clientPath} (reportEmail demo@voorbeeld.test, no Ads id)`,
    );

    const runs: RunSpec[] = [
      {
        key: "1-ad-copy",
        ext: "csv",
        workflowPath: "workflows/ad-copy.md",
        agentPath: "agents/copywriter.md",
        additional: [],
        stages: [["agents/copywriter.md"]],
        request:
          "Schrijf nieuwe responsive search ads (RSA) voor de zoekcampagnes van deze klant: sterke headlines en descriptions per advertentiegroep, klaar om te reviewen en te importeren.",
        clientFacing: false,
        touchesLiveAccount: false,
      },
      {
        key: "2-negative-keywords",
        ext: "csv",
        workflowPath: "workflows/account-optimization.md",
        agentPath: "agents/google-ads-optimization-specialist.md",
        additional: [],
        stages: [["agents/google-ads-optimization-specialist.md"]],
        request:
          "Doe de wekelijkse optimalisatie van dit Google Ads-account: mijn de zoektermen voor negatieve zoekwoorden, geef een geprioriteerde actielijst en een import-klare negatieven-CSV.",
        clientFacing: false,
        touchesLiveAccount: true,
      },
      {
        key: "3-monthly-report",
        ext: "md",
        workflowPath: "workflows/monthly-reporting.md",
        agentPath: "agents/reporting-specialist.md",
        additional: ["agents/google-ads-optimization-specialist.md"],
        stages: [
          ["agents/reporting-specialist.md"],
          ["agents/google-ads-optimization-specialist.md"],
        ],
        request:
          "Maak het maandrapport voor deze klant over vorige maand: belangrijkste resultaten t.o.v. de vorige periode en vorig jaar, uitleg van wat de cijfers stuurde, en aanbevelingen voor de komende maand.",
        clientFacing: true,
        touchesLiveAccount: false,
      },
    ];

    for (const r of runs) {
      await log(`RUN ${r.key} (${r.workflowPath}) starting`);
      let deliverableText = "";
      let approval:
        | { clientReport: string; reviewerVerdict: string | null; recipient: string }
        | null = null;

      const controller = new AbortController();
      const sink = (e: unknown): void => {
        const ev = (e ?? {}) as Record<string, unknown>;
        const type = ev.type;
        if (type === "deliverable_delta") {
          deliverableText += (ev.content as string) ?? "";
        } else if (type === "approval_required") {
          approval = {
            clientReport: (ev.clientReport as string) ?? "",
            reviewerVerdict: (ev.reviewerVerdict as string | null) ?? null,
            recipient: (ev.recipient as string) ?? "",
          };
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
        workflowPath: r.workflowPath,
        clientPath,
        request: r.request,
        clientFacing: r.clientFacing,
        touchesLiveAccount: r.touchesLiveAccount,
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
            `${OUT}/${r.key}.deliverable.${r.ext}`,
            deliverableText.trim() + "\n",
          );
        }

        const appr = approval as
          | { clientReport: string; reviewerVerdict: string | null; recipient: string }
          | null;
        if (appr && appr.clientReport.trim()) {
          await writeFile(`${OUT}/${r.key}.client-report.md`, appr.clientReport);
          if (appr.reviewerVerdict) {
            await writeFile(`${OUT}/${r.key}.reviewer.md`, appr.reviewerVerdict);
          }
          const pdf = await renderReportPdf(appr.clientReport, {
            clientName: client.name,
            subtitle: "Maandrapport — vorige maand",
            dateLabel: new Date().toLocaleDateString("nl-BE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
            metrics: null,
          });
          await writeFile(`${OUT}/${r.key}.report.pdf`, pdf);
          await log(
            `  PDF rendered (${pdf.length} bytes), held for ${appr.recipient} (NOT sent)`,
          );
        }

        await log(
          `  DONE ${r.key} status=${result.status} approval=${result.approvalStatus ?? "-"} deliverableChars=${deliverableText.length}`,
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

async function fileExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
