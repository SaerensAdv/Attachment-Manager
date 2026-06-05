import {
  useGetTeamStats,
  type LeaderboardEntry,
} from "@workspace/api-client-react";
import { Loader2, BarChart3, ArrowUpRight } from "lucide-react";
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

export default function Dashboard() {
  const { data: stats, isLoading, error } = useGetTeamStats();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter']">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Cijfers laden...
          </p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter'] px-6">
        <div className="max-w-md w-full border border-foreground bg-card p-8 text-center shadow-[4px_4px_0px_hsl(var(--foreground))]">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-3">
            Storing
          </p>
          <h1 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight mb-2">
            Cijfers onbereikbaar
          </h1>
          <p className="text-sm text-muted-foreground">
            De teamcijfers konden niet worden geladen.
          </p>
        </div>
      </div>
    );
  }

  const verdictTotal = stats.approved + stats.rejected;
  const approvalPct = verdictTotal
    ? Math.round((stats.approved / verdictTotal) * 100)
    : null;
  const leaderboard = stats.leaderboard;

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
            De activiteit van het AI-team in één oogopslag: hoeveel runs er zijn
            uitgevoerd, hoe ze afliepen en welke specialisten het meest
            bijdragen.
          </p>
        </header>

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
              label="Tokens totaal"
              value={formatTokens(stats.totalTokens)}
            />
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
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b-2 border-foreground font-['Space_Mono'] text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    <th className="px-4 py-3 font-normal">Specialist</th>
                    <th className="px-4 py-3 font-normal text-right">Geleid</th>
                    <th className="px-4 py-3 font-normal text-right">
                      Deelgenomen
                    </th>
                    <th className="px-4 py-3 font-normal text-right">
                      Gem. duur
                    </th>
                    <th className="px-4 py-3 font-normal text-right">
                      Tokens (out)
                    </th>
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
                          <span className="font-medium truncate">
                            {e.title}
                          </span>
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
                      <td className="px-4 py-3 text-right font-['Space_Mono'] text-xs">
                        {formatTokens(e.totalOutputTokens)}
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
      </div>
    </div>
  );
}
