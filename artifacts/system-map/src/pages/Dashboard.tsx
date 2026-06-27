import {
  useGetTeamStats,
  useGetClientsRevenue,
  type LeaderboardEntry,
} from "@workspace/api-client-react";
import { BarChart3, ArrowUpRight, Euro, Target } from "lucide-react";
import { Link } from "wouter";
import Reveal from "@/components/Reveal";
import { Skeleton } from "@/components/ui/skeleton";

// Brutalist skeleton block: sharp corners and a foreground tint so loading
// states match the editorial theme instead of a stray rounded grey box.
const SK = "rounded-none bg-foreground/10";

// Compact, human-readable duration (e.g. "1m 12s", "8s").
function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec ? `${min}m ${sec}s` : `${min}m`;
}

// Thousands-grouped token counts (e.g. "12.4k", "980").
function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Euro amount: cents-precise below €100, abbreviated above €1k (e.g. "€2.41",
// "€128", "€3.2k"). Rough cost estimate, so precision tapers with magnitude.
function formatEur(n: number): string {
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `€${Math.round(n)}`;
  return `€${n.toFixed(2)}`;
}

// Full euro amount with Belgian thousands grouping (e.g. "€ 3.000"). Used for
// the revenue figures, which read better in full than abbreviated.
const euroFmt = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
function formatEuro(n: number): string {
  return euroFmt.format(n);
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-2 border-foreground bg-card px-5 py-5 shadow-[3px_3px_0px_hsl(var(--foreground))]">
      <div className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
        {label}
      </div>
      <div className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl leading-none">
        {value}
      </div>
      {sub ? (
        <div className="font-['Inter'] text-xs text-muted-foreground mt-2">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.portraitThumbUrl) {
    return (
      <img
        src={entry.portraitThumbUrl}
        alt={entry.title}
        className="w-9 h-9 rounded-full object-cover border-2 border-foreground shrink-0"
      />
    );
  }
  const initials = entry.title.trim().slice(0, 2).toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full border-2 border-foreground bg-foreground/5 flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <span className="font-['Playfair_Display'] font-black text-xs text-foreground/70 leading-none">
        {initials}
      </span>
    </div>
  );
}

// Headline section the user cares about most: how much monthly recurring fee the
// agency is at versus the €10.000 goal, plus a per-client breakdown. Loads
// independently of the team activity below so a team-stats hiccup never hides it.
function RevenueOverview() {
  const { data, isLoading, error } = useGetClientsRevenue();

  if (isLoading) {
    return (
      <section className="mb-14" aria-busy="true" data-testid="revenue-loading">
        <div className="flex items-center gap-2 mb-4">
          <Euro className="w-4 h-4 text-accent" />
          <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
            Maandelijkse omzet
          </h2>
        </div>
        {/* Thermometer card */}
        <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] px-6 py-6">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <div className="space-y-3">
              <Skeleton className={`${SK} h-2.5 w-24`} />
              <Skeleton className={`${SK} h-12 w-48`} />
              <Skeleton className={`${SK} h-3 w-28`} />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className={`${SK} h-10 w-20 ml-auto`} />
              <Skeleton className={`${SK} h-2.5 w-14 ml-auto`} />
            </div>
          </div>
          <Skeleton className={`${SK} h-5 w-full`} />
        </div>
        {/* Breakdown rows */}
        <div className="mt-8 border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] divide-y divide-foreground/15">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className={`${SK} h-3 w-3`} />
              <div className="flex-1 space-y-2">
                <Skeleton className={`${SK} h-3 w-40`} />
                <Skeleton className={`${SK} h-2 w-full`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <div className="border-2 border-destructive bg-card shadow-[3px_3px_0px_hsl(var(--destructive))] px-6 py-8 mb-12">
        <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-2">
          Storing
        </p>
        <p className="font-['Inter'] text-sm text-muted-foreground">
          Het omzet-overzicht kon niet worden geladen.
        </p>
      </div>
    );
  }

  const total = data.totalMonthlyFeeEur;
  const goal = data.goalEur;
  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
  const reached = total >= goal && goal > 0;
  const remaining = Math.max(0, goal - total);

  const clientRows = data.clients
    .filter((c) => (c.monthlyFeeEur ?? 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      fee: c.monthlyFeeEur ?? 0,
      kind: "client" as const,
    }));
  const groupRows = (data.groups ?? [])
    .filter((g) => (g.monthlyFeeEur ?? 0) > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      fee: g.monthlyFeeEur ?? 0,
      kind: "group" as const,
    }));
  const withFee = [...clientRows, ...groupRows].sort((a, b) => b.fee - a.fee);
  const maxFee = withFee[0]?.fee ?? 0;

  return (
    <Reveal>
      <section className="mb-14" data-testid="revenue-overview">
        <header className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Euro className="w-4 h-4 text-accent" />
            <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
              Maandelijkse omzet
            </h2>
          </div>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Doel: {formatEuro(goal)} / maand
          </span>
        </header>

        {/* Goal thermometer */}
        <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] px-6 py-6">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <div>
              <div className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Nu per maand
              </div>
              <div
                className="font-['Playfair_Display'] font-black text-5xl sm:text-6xl leading-none"
                data-testid="revenue-total"
              >
                {formatEuro(total)}
              </div>
              <div className="font-['Inter'] text-sm text-muted-foreground mt-2">
                van {formatEuro(goal)} doel
              </div>
            </div>
            <div className="text-right">
              <div
                className="font-['Playfair_Display'] font-black text-4xl sm:text-5xl leading-none text-accent"
                data-testid="revenue-pct"
              >
                {pct}%
              </div>
              <div className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-2">
                bereikt
              </div>
            </div>
          </div>

          {/* Bar */}
          <div
            className="h-5 w-full border-2 border-foreground bg-background overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="revenue-progress"
          >
            <div
              className="h-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-3 font-['Inter'] text-sm">
            {reached ? (
              <span className="font-medium text-accent" data-testid="revenue-remaining">
                Doel bereikt — proficiat!
              </span>
            ) : (
              <span className="text-muted-foreground" data-testid="revenue-remaining">
                Nog{" "}
                <span className="font-semibold text-foreground">
                  {formatEuro(remaining)}
                </span>{" "}
                te gaan tot je doel.
              </span>
            )}
          </div>
        </div>

        {/* Per-client & per-group breakdown */}
        <div className="flex items-baseline justify-between mt-8 mb-3">
          <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
            Per klant &amp; groep
          </h3>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {clientRows.length} klant{clientRows.length === 1 ? "" : "en"}
            {groupRows.length > 0 && (
              <>
                {" · "}
                {groupRows.length} groep{groupRows.length === 1 ? "" : "en"}
              </>
            )}{" "}
            met fee
          </span>
        </div>

        {withFee.length === 0 ? (
          <p className="font-['Inter'] text-sm text-muted-foreground italic border border-foreground/20 bg-background/40 px-5 py-8 text-center">
            Nog geen fees ingevuld. Vul een maandelijkse fee in op een
            klanten-fiche of klantgroep, dan vult dit overzicht zich
            automatisch.
          </p>
        ) : (
          <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] divide-y divide-foreground/15">
            {withFee.map((r, i) => {
              const fee = r.fee;
              const barPct = maxFee > 0 ? Math.round((fee / maxFee) * 100) : 0;
              const sharePct = total > 0 ? Math.round((fee / total) * 100) : 0;
              const isGroup = r.kind === "group";
              return (
                <Link
                  key={`${r.kind}-${r.id}`}
                  href="/clients"
                  className="group flex items-center gap-4 px-4 py-3 hover:bg-foreground/5"
                  data-testid={`revenue-${r.kind}-${r.id}`}
                >
                  <span className="font-['Space_Mono'] text-[10px] text-muted-foreground w-4 shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-['Inter'] font-medium text-sm truncate">
                          {r.name}
                        </span>
                        <span
                          className={`font-['Space_Mono'] text-[8px] uppercase tracking-[0.15em] px-1.5 py-0.5 border shrink-0 ${
                            isGroup
                              ? "border-accent/50 text-accent bg-accent/5"
                              : "border-foreground/25 text-muted-foreground"
                          }`}
                        >
                          {isGroup ? "Groep" : "Klant"}
                        </span>
                      </span>
                      <span className="font-['Space_Mono'] text-xs whitespace-nowrap">
                        {formatEuro(fee)}
                        <span className="text-muted-foreground">
                          {" "}
                          · {sharePct}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full bg-accent/70 group-hover:bg-accent transition-colors"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </Reveal>
  );
}

// The AI-team activity block (runs, tokens, leaderboard). Self-contained so it
// can load/fail independently of the revenue overview above it.
function TeamActivity() {
  const { data: stats, isLoading, error } = useGetTeamStats();

  if (isLoading) {
    return (
      <div aria-busy="true" data-testid="team-loading">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-accent" />
          <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
            Team-activiteit
          </h2>
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="border-2 border-foreground bg-card px-5 py-5 shadow-[3px_3px_0px_hsl(var(--foreground))] space-y-3"
            >
              <Skeleton className={`${SK} h-2.5 w-20`} />
              <Skeleton className={`${SK} h-9 w-24`} />
              <Skeleton className={`${SK} h-2.5 w-28`} />
            </div>
          ))}
        </div>
        {/* Token tri-panel */}
        <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] mb-12 grid grid-cols-3 divide-x-2 divide-foreground">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4 space-y-2.5">
              <Skeleton className={`${SK} h-2.5 w-16`} />
              <Skeleton className={`${SK} h-7 w-20`} />
            </div>
          ))}
        </div>
        {/* Leaderboard rows */}
        <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 border-b border-foreground/15 last:border-b-0"
            >
              <Skeleton className={`${SK} h-4 w-4`} />
              <Skeleton className="rounded-full bg-foreground/10 h-9 w-9" />
              <Skeleton className={`${SK} h-3 w-40`} />
              <Skeleton className={`${SK} h-3 w-16 ml-auto`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="border-2 border-destructive bg-card shadow-[3px_3px_0px_hsl(var(--destructive))] px-6 py-8">
        <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-2">
          Storing
        </p>
        <p className="font-['Inter'] text-sm text-muted-foreground">
          De teamcijfers konden niet worden geladen.
        </p>
      </div>
    );
  }

  const verdictTotal = stats.approved + stats.rejected;
  const approvalPct = verdictTotal
    ? Math.round((stats.approved / verdictTotal) * 100)
    : null;
  const leaderboard = stats.leaderboard;

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-accent" />
        <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
          Team-activiteit
        </h2>
      </div>

      <Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <StatCard
            label="Runs totaal"
            value={String(stats.totalRuns)}
            sub={`${stats.completed} voltooid · ${stats.partial} gedeeltelijk`}
          />
          <StatCard
            label="Goedkeuring"
            value={approvalPct == null ? "—" : `${approvalPct}%`}
            sub={
              verdictTotal
                ? `${stats.approved} goedgekeurd · ${stats.rejected} afgekeurd`
                : `${stats.pending} in afwachting`
            }
          />
          <StatCard
            label="Gem. duur / run"
            value={formatDuration(stats.avgDurationMs)}
          />
          <StatCard
            label="Geschatte kosten"
            value={formatEur(stats.estimatedCostEur)}
            sub={
              stats.totalRuns
                ? `~${formatEur(stats.estimatedCostEur / stats.totalRuns)} / run`
                : undefined
            }
          />
        </div>
      </Reveal>

      <Reveal>
        <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] mb-12 grid grid-cols-3 divide-x-2 divide-foreground">
          <div className="px-5 py-4">
            <div className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              Tokens totaal
            </div>
            <div className="font-['Playfair_Display'] font-black text-2xl sm:text-3xl leading-none">
              {formatTokens(stats.totalTokens)}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              Input
            </div>
            <div className="font-['Playfair_Display'] font-black text-2xl sm:text-3xl leading-none">
              {formatTokens(stats.totalInputTokens)}
            </div>
            <div className="font-['Inter'] text-[11px] text-muted-foreground mt-1">
              context naar het model
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              Output
            </div>
            <div className="font-['Playfair_Display'] font-black text-2xl sm:text-3xl leading-none">
              {formatTokens(stats.totalOutputTokens)}
            </div>
            <div className="font-['Inter'] text-[11px] text-muted-foreground mt-1">
              door het team geschreven
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
            Ranglijst
          </h2>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            {leaderboard.length} specialisten
          </span>
        </div>

        {leaderboard.length === 0 ? (
          <p className="font-['Inter'] text-sm text-muted-foreground italic border border-foreground/20 bg-background/40 px-5 py-8 text-center">
            Nog geen runs vastgelegd. Zodra het team aan de slag gaat,
            verschijnen hier de cijfers.
          </p>
        ) : (
          <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b-2 border-foreground font-['Space_Mono'] text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  <th className="px-4 py-3 font-normal">Specialist</th>
                  <th className="px-4 py-3 font-normal text-right">Geleid</th>
                  <th className="px-4 py-3 font-normal text-right">
                    Deelgenomen
                  </th>
                  <th className="px-4 py-3 font-normal text-right">Gem. duur</th>
                  <th className="px-4 py-3 font-normal text-right">
                    Tokens (in/out)
                  </th>
                  <th className="px-4 py-3 font-normal text-right">Kosten</th>
                  <th className="px-4 py-3 font-normal w-8" />
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => (
                  <tr
                    key={e.agentPath}
                    className={`group font-['Inter'] text-sm ${
                      i !== leaderboard.length - 1
                        ? "border-b border-foreground/15"
                        : ""
                    } hover:bg-foreground/5`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href="/team"
                        className="flex items-center gap-3"
                        data-testid={`leaderboard-${e.slug}`}
                      >
                        <span className="font-['Space_Mono'] text-[10px] text-muted-foreground w-4 shrink-0">
                          {i + 1}
                        </span>
                        <Avatar entry={e} />
                        <span className="font-medium truncate">{e.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-['Space_Mono'] text-xs">
                      {e.runsLed}
                    </td>
                    <td className="px-4 py-3 text-right font-['Space_Mono'] text-xs">
                      {e.runsParticipated}
                    </td>
                    <td className="px-4 py-3 text-right font-['Space_Mono'] text-xs">
                      {formatDuration(e.avgDurationMs)}
                    </td>
                    <td className="px-4 py-3 text-right font-['Space_Mono'] text-xs whitespace-nowrap">
                      {formatTokens(e.totalInputTokens)}
                      <span className="text-muted-foreground"> / </span>
                      {formatTokens(e.totalOutputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right font-['Space_Mono'] text-xs">
                      {formatEur(e.estimatedCostEur)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>
    </>
  );
}

export default function Dashboard() {
  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16">
        <header className="border-b-2 border-foreground pb-5 mb-10">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Prestatie-overzicht
            </span>
          </div>
          <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
            Dashboard
          </h1>
          <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
            Aan hoeveel maandelijkse omzet zitten we — en hoe ver staat het
            AI-team — in één oogopslag.
          </p>
        </header>

        <RevenueOverview />
        <TeamActivity />
      </div>
    </div>
  );
}
