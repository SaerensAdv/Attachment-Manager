import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertOctagon, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import Reveal from "@/components/Reveal";

type Severity = "error" | "warning" | "info";

interface ValidationIssue {
  severity: Severity;
  kind: string;
  source?: string;
  target?: string;
  message: string;
}

interface ValidationReport {
  issues: ValidationIssue[];
  checkedAt?: string;
}

const SEVERITY_META: Record<
  Severity,
  { label: string; icon: typeof AlertOctagon; tone: string }
> = {
  error: { label: "Fouten", icon: AlertOctagon, tone: "hsl(var(--destructive))" },
  warning: { label: "Waarschuwingen", icon: AlertTriangle, tone: "hsl(var(--cat-workflow))" },
  info: { label: "Info", icon: Info, tone: "hsl(var(--accent))" },
};

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export default function Controle() {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/docs/validate`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ValidationReport;
        if (cancelled) return;
        setReport({
          issues: Array.isArray(data.issues) ? data.issues : [],
          checkedAt: data.checkedAt,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Onbekende fout");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map: Record<Severity, ValidationIssue[]> = {
      error: [],
      warning: [],
      info: [],
    };
    for (const issue of report?.issues ?? []) {
      if (map[issue.severity]) map[issue.severity].push(issue);
    }
    return map;
  }, [report]);

  const total = report?.issues.length ?? 0;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter']">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Controle uitvoeren...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter'] px-6">
        <div className="max-w-md w-full border border-foreground bg-card p-8 text-center shadow-[4px_4px_0px_hsl(var(--foreground))]">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-3">
            Storing
          </p>
          <h1 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight mb-2">
            Controle onbereikbaar
          </h1>
          <p className="text-sm text-muted-foreground">
            Kon de controle niet uitvoeren. Controleer je verbinding of de
            API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Saerens Advertising — Redactie
                </p>
                <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
                  Controle
                </h1>
              </div>
              <div className="text-right hidden sm:block shrink-0">
                <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Bevindingen
                </div>
                <div className="font-['Playfair_Display'] text-2xl italic leading-none mt-1">
                  No. {String(total).padStart(3, "0")}
                </div>
              </div>
            </div>
            <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
              Een redactionele kwaliteitscontrole van de kaart: ontbrekende
              verbindingen, losse documenten en andere bevindingen.
              {report?.checkedAt && (
                <>
                  {" "}
                  Laatst gecontroleerd:{" "}
                  <span className="font-['Space_Mono'] text-xs">
                    {new Date(report.checkedAt).toLocaleString("nl-BE")}
                  </span>
                  .
                </>
              )}
            </p>
          </header>
        </Reveal>

        {/* Counts */}
        <Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
            {SEVERITY_ORDER.map((sev) => {
              const meta = SEVERITY_META[sev];
              const Icon = meta.icon;
              const count = grouped[sev].length;
              return (
                <div
                  key={sev}
                  className="border border-foreground bg-card p-5 flex items-center gap-4 shadow-[4px_4px_0px_hsl(var(--foreground))]"
                >
                  <Icon className="w-6 h-6 shrink-0" style={{ color: meta.tone }} />
                  <div className="min-w-0">
                    <div className="font-['Playfair_Display'] font-black text-3xl leading-none">
                      {count}
                    </div>
                    <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      {meta.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Empty state */}
        {total === 0 ? (
          <Reveal>
            <div className="flex flex-col items-center justify-center gap-4 text-center border border-dashed border-foreground/30 bg-card py-24 px-6">
              <CheckCircle2 className="w-10 h-10 text-cat-knowledge" />
              <p className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
                Geen problemen gevonden
              </p>
              <p className="text-sm text-muted-foreground max-w-sm font-['Inter']">
                De kaart is volledig consistent. Er zijn geen fouten,
                waarschuwingen of opmerkingen.
              </p>
            </div>
          </Reveal>
        ) : (
          <div className="flex flex-col gap-12">
            {SEVERITY_ORDER.map((sev) => {
              const issues = grouped[sev];
              if (issues.length === 0) return null;
              const meta = SEVERITY_META[sev];
              const Icon = meta.icon;
              return (
                <Reveal key={sev}>
                  <section>
                    <div className="flex items-center gap-3 border-b-2 border-foreground pb-2 mb-5">
                      <Icon className="w-5 h-5" style={{ color: meta.tone }} />
                      <h2 className="font-['Playfair_Display'] font-bold text-2xl uppercase tracking-tight">
                        {meta.label}
                      </h2>
                      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground ml-auto">
                        {issues.length}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      {issues.map((issue, i) => (
                        <div
                          key={`${sev}-${i}`}
                          className="border-l-2 px-4 py-4 border-b border-foreground/20"
                          style={{ borderLeftColor: meta.tone }}
                        >
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                              {issue.kind}
                            </span>
                            {(issue.source || issue.target) && (
                              <span className="font-['Space_Mono'] text-[11px] text-foreground/80">
                                {issue.source}
                                {issue.source && issue.target ? " → " : ""}
                                {issue.target}
                              </span>
                            )}
                          </div>
                          <p className="font-['Inter'] text-sm text-foreground leading-relaxed mt-2">
                            {issue.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
