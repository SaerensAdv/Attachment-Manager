import {
  useGetTeamStats,
  useGetClientsRevenue,
  type LeaderboardEntry,
} from "@workspace/api-client-react";
import { Loader2, BarChart3, ArrowUpRight, Euro, Target } from "lucide-react";
import { Link } from "wouter";
import Reveal from "@/components/Reveal";

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
      <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] px-6 py-10 mb-12 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Omzet laden...
        </span>
      </div>
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

  const withFee = data.clients
    .filter((c) => (c.monthlyFeeEur ?? 0) > 0)
    .sort((a, b) => (b.monthlyFeeEur ?? 0) - (a.monthlyFeeEur ?? 0));
  const maxFee = withFee[0]?.monthlyFeeEur ?? 0;

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

        {/* Per-client breakdown */}
        <div className="flex items-baseline justify-between mt-8 mb-3">
          <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
            Per klant
          </h3>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {data.withFeeCount} van {data.clientCount} met fee
          </span>
        </div>

        {withFee.length === 0 ? (
          <p className="font-['Inter'] text-sm text-muted-foreground italic border border-foreground/20 bg-background/40 px-5 py-8 text-center">
            Nog geen fees ingevuld. Vul per klant een maandelijkse fee in op de
            Klanten-fiche, dan vult dit overzicht zich automatisch.
          </p>
        ) : (
          <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] divide-y divide-foreground/15">
            {withFee.map((c, i) => {
              const fee = c.monthlyFeeEur ?? 0;
              const barPct = maxFee > 0 ? Math.round((fee / maxFee) * 100) : 0;
              const sharePct = total > 0 ? Math.round((fee / total) * 100) : 0;
              return (
                <Link
                  key={c.id}
                  href="/clients"
                  className="group flex items-center gap-4 px-4 py-3 hover:bg-foreground/5"
                  data-testid={`revenue-client-${c.id}`}
                >
                  <span className="font-['Space_Mono'] text-[10px] text-muted-foreground w-4 shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-['Inter'] font-medium text-sm truncate">
                        {c.name}
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
      <div className="border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] px-6 py-10 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Teamcijfers laden...
        </span>
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
