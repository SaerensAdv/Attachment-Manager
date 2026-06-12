import { resolveHeadIdentity } from "../src/lib/email-identity";
import { sendEmail } from "../src/lib/email";
import {
  buildBrandedEmail,
  resolveHeadPortrait,
} from "../src/lib/monthly-report-email";
import { SAERENS_LOGO_CID, saerensLogoInlineImage } from "../src/lib/brand-logo";

/**
 * One-off verification for the per-Head email identity + portrait. For each
 * department Head it sends a REAL branded email from that Head's alias, with the
 * SA logo in the header lockup and the Head's portrait in the footer signature,
 * so a human can confirm both the visible sender AND that each email carries the
 * right face. Drives the exact production send path (buildBrandedEmail + inline
 * CID).
 */
const TEST_TO = process.env.TEST_TO || "ax.saerens@gmail.com";

const OWNER_PATHS = [
  "agents/orchestrator.md",
  "agents/google-ads-strategist.md",
  "agents/seo-specialist.md",
  "agents/copywriter.md",
  "agents/client-success-agent.md",
  "agents/qa-compliance-reviewer.md",
];

async function main(): Promise<void> {
  console.log("AGENT_EMAIL_DOMAIN =", process.env.AGENT_EMAIL_DOMAIN || "(unset)");
  console.log("Verstuur verificatiemails naar:", TEST_TO);
  console.log("");

  for (const p of OWNER_PATHS) {
    const id = await resolveHeadIdentity(p);
    if (!id) {
      console.log(`SKIP  geen identiteit voor ${p}`);
      continue;
    }
    if (!id.address) {
      console.log(`SKIP  geen alias (AGENT_EMAIL_DOMAIN onset?) voor ${id.departmentTitle}`);
      continue;
    }

    const logo = saerensLogoInlineImage();
    const portrait = await resolveHeadPortrait(id.headAgentPath);
    const subject = `Profielfoto-test — ${id.name ?? id.departmentTitle} (${id.departmentTitle})`;
    const html = buildBrandedEmail({
      clientName: "Testklant",
      periodLabel: "mei 2026",
      dateLabel: "12 juni 2026",
      bodyText: [
        `Dag,`,
        `Dit is een testbericht om de afzender, het SA-logo in de header én de ingesloten profielfoto te verifiëren.`,
        `Verwachte afzender: ${id.displayName}.`,
      ].join("\n\n"),
      metrics: null,
      signature: id.signature,
      portraitCid: portrait?.cid,
      logoCid: SAERENS_LOGO_CID,
    });

    try {
      const res = await sendEmail({
        to: TEST_TO,
        subject,
        html,
        fromAddress: id.address,
        fromName: id.displayName,
        inlineImages: portrait ? [logo, portrait] : [logo],
      });
      console.log(
        `SENT  ${id.address.padEnd(34)} foto:${portrait ? "ja " : "nee"}  als "${id.displayName}"  (msgId ${res.messageId})`,
      );
    } catch (e) {
      console.log(`FAIL  ${id.address}: ${(e as Error).message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
