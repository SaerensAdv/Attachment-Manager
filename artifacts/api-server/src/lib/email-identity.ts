import { getTeamRoster } from "./team";

/**
 * Per-Head email identity — who an outbound client email is sent AS.
 *
 * Every department in the agency org model (parsed from AGENTS.md) has an owner:
 * its "Head". When the team produces a client-facing email (a monthly report, a
 * reply), it is sent from the responsible Head — derived from the run's lead
 * agent's department, never hardcoded per department — with the agency owner in
 * CC. This keeps the feature generic: add or move a Head in AGENTS.md and the
 * sender identity follows automatically.
 *
 * The alias local-part is DERIVED from the department id (e.g. `paid-media` ->
 * `paidmedia@<domain>`). That is safe even when the alias is not a verified
 * Gmail "send as": Gmail silently rewrites an unverified From to the primary
 * mailbox, and inbound routing keys off the Gmail threadId, not the address — so
 * a missing/unverified alias degrades gracefully. The domain and the owner CC
 * are deployment config (env), NOT in AGENTS.md (which feeds model prompts).
 */

export interface HeadEmailIdentity {
  departmentId: string;
  departmentTitle: string;
  /** The Head agent's doc path (used to route inbound replies back to them). */
  headAgentPath: string;
  /** Persona display name, or null when the agent has no "Name" bullet. */
  name: string | null;
  /** Full RFC 822 From display name. */
  displayName: string;
  /** Derived alias address, or null when no AGENT_EMAIL_DOMAIN is configured. */
  address: string | null;
  /** Plain-text footer signature lines (name + role). */
  signature: string;
}

/** Derive the alias local-part from a department id: `paid-media` -> `paidmedia`. */
export function aliasLocalPart(departmentId: string): string {
  return departmentId.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** The From display name shown in the client's inbox. */
export function headDisplayName(
  name: string | null,
  departmentTitle: string,
): string {
  return name
    ? `${name} — ${departmentTitle}, Saerens Advertising`
    : `${departmentTitle} — Saerens Advertising`;
}

/** The plain-text signature used in the email footer band. */
export function headSignature(
  name: string | null,
  departmentTitle: string,
): string {
  return [name ?? departmentTitle, `${departmentTitle} · Saerens Advertising`].join(
    "\n",
  );
}

/** The configured agency owner address kept in CC, or null when unset. */
export function ownerEmail(): string | null {
  const v = (process.env.OWNER_EMAIL ?? "").trim();
  return v.length > 0 ? v : null;
}

/** The configured agent email domain, or null when unset. */
export function agentEmailDomain(): string | null {
  const v = (process.env.AGENT_EMAIL_DOMAIN ?? "").trim();
  return v.length > 0 ? v : null;
}

/**
 * Resolve the responsible Head's email identity from a run's lead agent path:
 * lead -> its department -> the department's owner (Head). Best-effort: returns
 * null when the roster can't be read or the lead isn't found, so a delivery
 * never fails just because identity couldn't be resolved (it falls back to the
 * primary mailbox with no alias).
 */
export async function resolveHeadIdentity(
  leadAgentPath: string,
): Promise<HeadEmailIdentity | null> {
  try {
    const roster = await getTeamRoster();
    const lead = roster.find((m) => m.path === leadAgentPath);
    if (!lead) return null;
    const dept = lead.department;
    // Prefer the department owner (Head) as the sender; fall back to the lead.
    const head = roster.find((m) => m.slug === dept.ownerSlug) ?? lead;
    const name = head.name?.trim() || null;
    const domain = agentEmailDomain();
    const address = domain ? `${aliasLocalPart(dept.id)}@${domain}` : null;
    return {
      departmentId: dept.id,
      departmentTitle: dept.title,
      headAgentPath: head.path,
      name,
      displayName: headDisplayName(name, dept.title),
      address,
      signature: headSignature(name, dept.title),
    };
  } catch {
    return null;
  }
}
