// Stress-test harness for the Saerens AI-team departments (Task #44).
//
// Read-only with respect to live ad accounts and real client emails: it uses
// the file-based sample client (clients/client-example.md), which is NOT a
// db-linked account, so every live-Google-Ads / email-send branch in the engine
// is gated off (dbClientIdFromPath === null). It drives the ALREADY-RUNNING
// api-server over localhost so long runs execute server-side and are archived
// even if a single HTTP call is torn down.
//
// Phases (pass as argv[2]): "route" (full matrix, routing only),
// "gen" (curated subset, full autonomous generations + inspect), "all".

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";

const BASE = "http://localhost:8080/api";
const CLIENT = "clients/client-example.md";
const SECRET = process.env.AUTONOMOUS_TRIGGER_SECRET;
const OUT = "scripts/.stress";
mkdirSync(OUT, { recursive: true });

// ---- Department model (mirrors AGENTS.md "Agency organisation") -------------
const DEPTS = {
  "0 Direction": ["agents/orchestrator.md"],
  "1 Paid Media": [
    "agents/google-ads-strategist.md",
    "agents/google-ads-setup-specialist.md",
    "agents/google-ads-optimization-specialist.md",
    "agents/meta-ads-strategist.md",
    "agents/shopping-feed-specialist.md",
  ],
  "2 SEO & Web": [
    "agents/seo-specialist.md",
    "agents/web-developer.md",
    "agents/landing-page-specialist.md",
    "agents/cro-specialist.md",
    "agents/analytics-tracking-specialist.md",
  ],
  "3 Content & Creative": [
    "agents/copywriter.md",
    "agents/humanizer.md",
    "agents/creative-designer.md",
    "agents/brand-identity-designer.md",
    "agents/email-automation-specialist.md",
  ],
  "4 Client & Growth": [
    "agents/client-success-agent.md",
    "agents/client-onboarding-agent.md",
    "agents/reporting-specialist.md",
    "agents/sales-proposal-agent.md",
    "agents/competitive-research-analyst.md",
    "agents/legal-contracts-specialist.md",
    "agents/operations-coordinator.md",
  ],
  "5 Quality & Compliance": ["agents/qa-compliance-reviewer.md"],
};
function deptOf(path) {
  for (const [d, members] of Object.entries(DEPTS))
    if (members.includes(path)) return d;
  return "?";
}

// ---- Prompt matrix ---------------------------------------------------------
// expect.dept = department the PRIMARY agent should land in. expect.maxTeam =
// soft ceiling for "minimal team". expect.parallel = a parallel stage is wanted.
const MATRIX = [
  // 0. Direction & Orchestration (routing correctness)
  { id: "0.1", group: "0 Direction", text: "We hebben een nieuwe klant: een lokale meubelwinkel met webshop. Maak een voorstel voor een volledige aanpak.", expect: { maxTeam: 4 } },
  { id: "0.2", group: "0 Direction", text: "De zoekadvertenties van klant X presteren al weken slecht.", expect: { dept: "1 Paid Media", maxTeam: 2 } },
  { id: "0.3", group: "0 Direction", text: "Kun je onze laatste advertentieteksten controleren op naleving van het beleid?", expect: { dept: "5 Quality & Compliance", maxTeam: 2 } },
  { id: "0.4", group: "0 Direction", text: "Help klant Y groeien.", expect: { maxTeam: 3 } },
  { id: "0.5", group: "0 Direction", text: "We willen zowel betere SEO als sterkere Meta-advertenties.", expect: { parallel: true, maxTeam: 4 } },
  { id: "0.6", group: "0 Direction", text: "Schrijf de interne databasecode voor onze tool.", expect: { graceful: true } },

  // 1. Paid Media
  { id: "1.1", group: "1 Paid Media", text: "Zet een nieuwe Google Search-campagne op voor een B2B-softwareklant die demo-aanvragen wil, budget €4.000/maand.", expect: { dept: "1 Paid Media", maxTeam: 3 } },
  { id: "1.2", group: "1 Paid Media", text: "Onze Meta-campagnes zien een dalende ROAS de afgelopen maand — wat is je plan?", expect: { dept: "1 Paid Media", maxTeam: 2 } },
  { id: "1.3", group: "1 Paid Media", text: "Bouw een Shopping-feedstrategie voor een webshop met ~2.000 producten.", expect: { dept: "1 Paid Media", maxTeam: 2 } },
  { id: "1.4", group: "1 Paid Media", text: "Maak een gecombineerd paid-mediaplan (Google + Meta) voor een productlancering, €10k/maand.", expect: { dept: "1 Paid Media", maxTeam: 3 } },
  { id: "1.5", group: "1 Paid Media", text: "De CPA in Performance Max ligt te hoog. Geef een concreet optimalisatieplan.", expect: { dept: "1 Paid Media", maxTeam: 2 } },
  { id: "1.6", group: "1 Paid Media", text: "Welke campagnestructuur raad je aan voor een klant met 3 productlijnen en aparte budgetten?", expect: { dept: "1 Paid Media", maxTeam: 2 } },

  // 2. SEO & Web
  { id: "2.1", group: "2 SEO & Web", text: "Doe een SEO-audit voor de website van klant X en geef de top-5 prioriteiten.", expect: { dept: "2 SEO & Web", maxTeam: 2 } },
  { id: "2.2", group: "2 SEO & Web", text: "Onze landingspagina converteert op 1,2%. Geef concrete verbeteringen.", expect: { dept: "2 SEO & Web", maxTeam: 2 } },
  { id: "2.3", group: "2 SEO & Web", text: "Stel een organisch contentplan op rond 'duurzame verpakkingen'.", expect: { dept: "2 SEO & Web", maxTeam: 2 } },
  { id: "2.4", group: "2 SEO & Web", text: "Controleer of de conversietracking (GA4 + server-side) correct is opgezet.", expect: { dept: "2 SEO & Web", maxTeam: 2 } },
  { id: "2.5", group: "2 SEO & Web", text: "We willen een nieuwe productpagina bouwen — geef de technische én conversie-aanpak.", expect: { dept: "2 SEO & Web", maxTeam: 3 } },
  { id: "2.6", group: "2 SEO & Web", text: "Geef een plan om de Core Web Vitals van de site te verbeteren.", expect: { dept: "2 SEO & Web", maxTeam: 2 } },

  // 3. Content & Creative
  { id: "3.1", group: "3 Content & Creative", text: "Schrijf 5 advertentievarianten (NL) voor een Google Search-campagne van een tandartspraktijk.", expect: { dept: "3 Content & Creative", maxTeam: 2 } },
  { id: "3.2", group: "3 Content & Creative", text: "Ontwikkel een merkidentiteitsrichting voor een nieuw koffiemerk.", expect: { dept: "3 Content & Creative", maxTeam: 2 } },
  { id: "3.3", group: "3 Content & Creative", text: "Maak een e-mailflow voor verlaten winkelwagens (3 mails).", expect: { dept: "3 Content & Creative", maxTeam: 2 } },
  { id: "3.4", group: "3 Content & Creative", text: "Bedenk een creatief concept voor een zomercampagne op social.", expect: { dept: "3 Content & Creative", maxTeam: 2 } },
  { id: "3.5", group: "3 Content & Creative", text: "Herschrijf deze tekst zodat ze natuurlijker en menselijker klinkt: 'Wij zijn marktleider in innovatieve oplossingen voor uw bedrijf.'", expect: { dept: "3 Content & Creative", maxTeam: 2 } },
  { id: "3.6", group: "3 Content & Creative", text: "Stel een tone-of-voice gids op voor een B2B-klant.", expect: { dept: "3 Content & Creative", maxTeam: 2 } },

  // 4. Client & Growth
  { id: "4.1", group: "4 Client & Growth", text: "Stel een onboardingplan op voor een nieuwe e-commerce klant.", expect: { dept: "4 Client & Growth", maxTeam: 2 } },
  { id: "4.2", group: "4 Client & Growth", text: "Maak een maandrapport voor klant X met de belangrijkste inzichten en aanbevelingen.", expect: { dept: "4 Client & Growth", maxTeam: 2 } },
  { id: "4.3", group: "4 Client & Growth", text: "Schrijf een voorstel/offerte voor een prospect die full-service marketing wil.", expect: { dept: "4 Client & Growth", maxTeam: 2 } },
  { id: "4.4", group: "4 Client & Growth", text: "Doe concurrentieonderzoek voor een lokale fitnessketen.", expect: { dept: "4 Client & Growth", maxTeam: 2 } },
  { id: "4.5", group: "4 Client & Growth", text: "Stel een dienstverleningsovereenkomst op met onze standaardvoorwaarden.", expect: { dept: "4 Client & Growth", maxTeam: 2 } },
  { id: "4.6", group: "4 Client & Growth", text: "Plan de interne taakverdeling voor de lancering van klant Y volgende week.", expect: { dept: "4 Client & Growth", maxTeam: 2 } },

  // 5. Quality & Compliance
  { id: "5.1", group: "5 Quality & Compliance", text: "Review deze advertentietekst op naleving van het Google Ads-beleid en onze merkrichtlijnen: 'Beste dakwerker van Antwerpen — gegarandeerd 100% waterdicht of geld terug!'", expect: { dept: "5 Quality & Compliance", maxTeam: 2 } },
  { id: "5.2", group: "5 Quality & Compliance", text: "Controleer dit maandrapport op fouten en claims die we niet kunnen onderbouwen: 'Onze campagnes leverden 300% meer omzet en de beste ROI in de sector.'", expect: { dept: "5 Quality & Compliance", maxTeam: 2 } },

  // Cross-cutting
  { id: "X.1", group: "X Cross-cutting", text: "Maak deze headline korter: 'Professionele dakrenovatie in Antwerpen voor particulieren en bedrijven met jarenlange ervaring'.", expect: { dept: "3 Content & Creative", maxTeam: 1 } },
  { id: "X.2", group: "X Cross-cutting", text: "Doe concurrentieonderzoek én controleer de tracking voor klant X.", expect: { parallel: true, maxTeam: 3 } },
];

// ---- HTTP helpers ----------------------------------------------------------
async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave raw */ }
  return { status: res.status, json, text };
}
async function get(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave raw */ }
  return { status: res.status, json, text };
}

// ---- Phase A: routing ------------------------------------------------------
async function routeOne(p) {
  const t0 = Date.now();
  let r;
  try {
    r = await post("/route", { clientPath: CLIENT, request: p.text });
  } catch (e) {
    return { ...p, error: String(e), ms: Date.now() - t0 };
  }
  const j = r.json ?? {};
  const stages = j.plan?.stages ?? [];
  const team = [j.agent, ...(j.additionalAgents ?? [])].filter(Boolean);
  return {
    id: p.id,
    group: p.group,
    text: p.text,
    expect: p.expect,
    ms: Date.now() - t0,
    needsClarification: !!j.needsClarification,
    clarification: j.clarification ?? null,
    taskType: j.taskType ?? null,
    reasoning: j.reasoning ?? null,
    workflow: j.workflow?.path ?? null,
    primary: j.agent?.path ?? null,
    primaryDept: j.agent ? deptOf(j.agent.path) : null,
    team: team.map((a) => a.path),
    teamSize: team.length,
    stageShape: stages.map((s) => s.length),
    parallel: stages.some((s) => s.length > 1),
    clientFacing: j.plan?.clientFacing ?? null,
    touchesLiveAccount: j.plan?.touchesLiveAccount ?? null,
  };
}

async function runPhaseA() {
  // Sequential + throttled: the LLM routes are rate-limited to 30 req/min, so a
  // parallel burst trips the limiter (429 -> corrupted/empty routing). Run one
  // at a time with a small delay. An optional comma-list of ids (argv[3]) routes
  // only those and MERGES into the existing route-results.json by id, so the
  // matrix can be collected in chunks across shell windows (and re-verified
  // entries can overwrite earlier rate-limited ones).
  const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
  const prompts = only ? MATRIX.filter((m) => only.has(m.id)) : MATRIX;
  const prior = existsSync(`${OUT}/route-results.json`)
    ? JSON.parse(readFileSync(`${OUT}/route-results.json`, "utf8"))
    : [];
  const byId = new Map(prior.map((r) => [r.id, r]));
  let n = 0;
  for (const p of prompts) {
    const r = await routeOne(p);
    byId.set(r.id, r);
    process.stdout.write(`routed ${++n}/${prompts.length}: ${r.id}\n`);
    await new Promise((res) => setTimeout(res, 800));
  }
  // Preserve matrix order.
  const results = MATRIX.map((m) => byId.get(m.id)).filter(Boolean);
  writeFileSync(`${OUT}/route-results.json`, JSON.stringify(results, null, 2));
  // Compact console summary.
  for (const r of results) {
    const flag =
      r.expect.dept && r.primaryDept && r.expect.dept !== r.primaryDept ? "  <-- DEPT MISMATCH" : "";
    console.log(
      `${r.id} [${r.group}] -> ${r.primaryDept ?? (r.needsClarification ? "CLARIFY" : "none")} | team=${r.teamSize} stages=${JSON.stringify(r.stageShape)} par=${r.parallel} cf=${r.clientFacing} live=${r.touchesLiveAccount} ${r.ms}ms${flag}`,
    );
  }
  return results;
}

// ---- Phase B: full autonomous generation + inspect -------------------------
async function maxGenId() {
  const r = await get("/generations");
  const arr = r.json?.generations ?? [];
  return arr.reduce((m, g) => Math.max(m, g.id ?? 0), 0);
}

async function buildBody(p, routeResult) {
  const workflow = routeResult.workflow;
  if (!workflow) return null;
  const body = {
    clientPath: CLIENT,
    workflowPath: workflow,
    request: p.text,
    agentPath: routeResult.primary,
    additionalAgentPaths: routeResult.team.slice(1),
    clientFacing: routeResult.clientFacing ?? undefined,
    touchesLiveAccount: routeResult.touchesLiveAccount === true,
  };
  // Rebuild stages as path-groups from the routing plan (re-route to get them).
  const rr = await post("/route", { clientPath: CLIENT, request: p.text });
  const planStages = rr.json?.plan?.stages ?? [];
  if (planStages.length) body.stages = planStages.map((s) => s.map((a) => a.path));
  return body;
}

async function inspect(genId, extra = {}) {
  const gen = (await get(`/generations/${genId}`)).json;
  const steps = (await get(`/generations/${genId}/steps`)).json?.steps ?? [];
  return {
    ...extra,
    genId,
    status: gen?.status ?? null,
    approvalStatus: gen?.approvalStatus ?? null,
    pendingDelivery: gen?.hasPendingDelivery ? "PRESENT(held)" : null,
    leadAgentPath: gen?.leadAgentPath ?? null,
    teamPaths: gen?.teamPaths ?? null,
    triggerSource: gen?.triggerSource ?? null,
    durationMs: gen?.durationMs ?? null,
    totalTokens: gen?.totalTokens ?? null,
    finalMarkdownLen: (gen?.finalMarkdown ?? "").length,
    finalMarkdownHead: (gen?.finalMarkdown ?? "").slice(0, 400),
    hasQAsection: /QA & Compliance|interne controle/i.test(gen?.finalMarkdown ?? ""),
    hasLiveNote: /live[- ]account|live Google Ads|live account/i.test(gen?.finalMarkdown ?? ""),
    steps: steps.map((s) => ({
      order: s.stepOrder, agent: s.agentPath, role: s.role,
      status: s.status, ms: s.durationMs, inTok: s.inputTokens,
      outTok: s.outputTokens, chars: s.charCount,
    })),
  };
}

async function genOne(p, routeResult) {
  if (!SECRET) throw new Error("AUTONOMOUS_TRIGGER_SECRET ontbreekt in env.");
  const workflow = routeResult.workflow;
  if (!workflow) return { id: p.id, skipped: "no workflow from routing" };
  const body = await buildBody(p, routeResult);

  const before = await maxGenId();
  const t0 = Date.now();
  let triggered = null;
  try {
    const r = await post(
      "/generate/autonomous",
      body,
      { "x-trigger-secret": SECRET },
    );
    triggered = { status: r.status, json: r.json };
  } catch (e) {
    triggered = { error: String(e) };
  }
  // Resolve the generation id (from the response, or by polling for a new row).
  let genId = triggered?.json?.id ?? null;
  if (!genId) {
    for (let i = 0; i < 40 && !genId; i++) {
      await new Promise((res) => setTimeout(res, 5000));
      const cur = await get("/generations");
      const arr = cur.json?.generations ?? [];
      const fresh = arr.find((g) => g.id > before && g.requestText === p.text);
      if (fresh) genId = fresh.id;
    }
  }
  const ms = Date.now() - t0;
  if (!genId) return { id: p.id, body, triggered, ms, error: "no generation id resolved" };

  const gen = (await get(`/generations/${genId}`)).json;
  const steps = (await get(`/generations/${genId}/steps`)).json?.steps ?? [];
  return {
    id: p.id,
    group: p.group,
    text: p.text,
    ms,
    genId,
    workflow,
    triggered: triggered?.json ?? triggered,
    status: gen?.status ?? null,
    approvalStatus: gen?.approvalStatus ?? null,
    pendingDelivery: gen?.hasPendingDelivery ? "PRESENT(held)" : null,
    leadAgentPath: gen?.leadAgentPath ?? null,
    teamPaths: gen?.teamPaths ?? null,
    finalMarkdownLen: (gen?.finalMarkdown ?? "").length,
    finalMarkdownHead: (gen?.finalMarkdown ?? "").slice(0, 600),
    hasQAsection: /QA & Compliance|interne controle/i.test(gen?.finalMarkdown ?? ""),
    steps: steps.map((s) => ({
      order: s.stepOrder,
      agent: s.agentPath,
      role: s.role,
      status: s.status,
      ms: s.durationMs,
      inTok: s.inputTokens,
      outTok: s.outputTokens,
      chars: s.charCount,
    })),
  };
}

async function runPhaseB() {
  const routeResults = JSON.parse(
    readFileSync(`${OUT}/route-results.json`, "utf8"),
  );
  const byId = Object.fromEntries(routeResults.map((r) => [r.id, r]));
  // Curated subset for full-flow validation (handoffs, QC gate, parallel exec,
  // typed deliverable). Only ids whose routing returned a workflow are usable.
  const subset = (process.argv[3] ? process.argv[3].split(",") : ["2.1", "1.1", "X.2", "3.1", "4.1"]);
  const out = [];
  for (const id of subset) {
    const rr = byId[id];
    if (!rr) { out.push({ id, error: "no routing result" }); continue; }
    process.stdout.write(`generating ${id} (${rr.workflow ?? "no-wf"})...\n`);
    const r = await genOne(MATRIX.find((m) => m.id === id), rr);
    out.push(r);
    writeFileSync(`${OUT}/gen-results.json`, JSON.stringify(out, null, 2));
    console.log(`  ${id} -> gen#${r.genId ?? "?"} status=${r.status ?? r.error} steps=${r.steps?.length ?? 0} hasQA=${r.hasQAsection} approval=${r.approvalStatus} ${r.ms}ms`);
  }
  return out;
}

// Fire-and-forget: trigger the autonomous runs, then abort the client fetch
// after a few seconds. The server keeps running each team to completion and
// archives it (the controller is created server-side, never aborted by a client
// disconnect), so this survives the shell's 120s window. A meta file records
// the request text + the max id seen before firing so `show` can match the new
// rows. Use this when full runs outlive a single bash call.
async function fireMode() {
  if (!SECRET) throw new Error("AUTONOMOUS_TRIGGER_SECRET ontbreekt in env.");
  const routeResults = JSON.parse(readFileSync(`${OUT}/route-results.json`, "utf8"));
  const byId = Object.fromEntries(routeResults.map((r) => [r.id, r]));
  const subset = process.argv[3] ? process.argv[3].split(",") : ["3.1", "X.2", "4.2"];
  const before = await maxGenId();
  const meta = { before, fired: [] };
  for (const id of subset) {
    const rr = byId[id];
    if (!rr) { console.log(`${id}: no routing result`); continue; }
    const body = await buildBody(MATRIX.find((m) => m.id === id), rr);
    if (!body) { console.log(`${id}: no workflow, skipped`); continue; }
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    fetch(`${BASE}/generate/autonomous`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-trigger-secret": SECRET },
      body: JSON.stringify(body),
      signal: ac.signal,
    }).catch(() => {}).finally(() => clearTimeout(t));
    meta.fired.push({ id, text: body.request, workflow: body.workflowPath });
    console.log(`fired ${id} (${body.workflowPath})`);
    await new Promise((res) => setTimeout(res, 1500));
  }
  writeFileSync(`${OUT}/fire-meta.json`, JSON.stringify(meta, null, 2));
  console.log(`fired ${meta.fired.length} run(s); before-id=${before}`);
}

// Match the fired runs to their archived rows and inspect each.
async function showMode() {
  const meta = JSON.parse(readFileSync(`${OUT}/fire-meta.json`, "utf8"));
  const all = (await get("/generations")).json?.generations ?? [];
  const out = [];
  for (const f of meta.fired) {
    const row = all.find((g) => g.id > meta.before && g.requestText === f.text);
    if (!row) { out.push({ id: f.id, pending: true, note: "not archived yet" }); console.log(`${f.id}: not archived yet`); continue; }
    const r = await inspect(row.id, { id: f.id, workflow: f.workflow });
    out.push(r);
    console.log(`${f.id} -> gen#${r.genId} status=${r.status} steps=${r.steps.length} hasQA=${r.hasQAsection} approval=${r.approvalStatus ?? "none"} held=${r.pendingDelivery ?? "no"}`);
  }
  writeFileSync(`${OUT}/gen-results.json`, JSON.stringify(out, null, 2));
}

// ---- entry -----------------------------------------------------------------
const phase = process.argv[2] ?? "route";
if (phase === "route" || phase === "all") await runPhaseA();
if (phase === "gen" || phase === "all") await runPhaseB();
if (phase === "fire") await fireMode();
if (phase === "show") await showMode();
console.log("done:", phase);
