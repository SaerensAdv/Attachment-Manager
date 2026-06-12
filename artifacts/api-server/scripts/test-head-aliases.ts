import { resolveHeadIdentity } from "../src/lib/email-identity";
import { sendEmail } from "../src/lib/email";

/**
 * One-off verification: send a real email from each department Head's alias so a
 * human can confirm Gmail keeps the per-Head "send as" address (instead of
 * rewriting it to the primary mailbox). Drives the exact production send path.
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
    const subject = `Afzender-test — ${id.name ?? id.departmentTitle} (${id.departmentTitle})`;
    const html = [
      `<p>Dit is een testbericht om de zichtbare afzender te verifiëren.</p>`,
      `<p><strong>Verwachte afzender:</strong> ${id.displayName} &lt;${id.address}&gt;</p>`,
      `<hr/>`,
      `<pre style="font-family:inherit">${id.signature}</pre>`,
    ].join("\n");

    try {
      const res = await sendEmail({
        to: TEST_TO,
        subject,
        html,
        fromAddress: id.address,
        fromName: id.displayName,
      });
      console.log(
        `SENT  ${id.address.padEnd(40)} als "${id.displayName}"  (msgId ${res.messageId})`,
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
