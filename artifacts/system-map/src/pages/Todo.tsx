import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetTodoOverview,
  useResolveAlert,
  getGetTodoOverviewQueryKey,
  getGetAlertsQueryKey,
  type PendingApproval,
  type ImprovementProposal,
  type SystemAlert,
} from "@workspace/api-client-react";
import {
  Loader2,
  AlertTriangle,
  MailCheck,
  Lightbulb,
  Check,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import Reveal from "@/components/Reveal";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("nl-BE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Friendly Dutch label for a held deliverable's kind; falls back to the raw
// value so an unknown/new kind still reads sensibly instead of breaking.
const KIND_LABEL: Record<string, string> = {
  "monthly-report-email": "Maandrapport (e-mail)",
  "email-reply": "E-mailantwoord",
  website: "Website",
  "slide-deck": "Slide deck",
  "animated-video": "Animatievideo",
  "data-app": "Data-app",
  "google-ads-csv": "Ad-copy CSV",
  factuur: "Factuur",
  offerte: "Offerte",
};

function kindLabel(kind: string | null): string {
  if (!kind) return "Eindproduct";
  return KIND_LABEL[kind] ?? kind;
}

const SOURCE_LABEL: Record<string, string> = {
  scheduler: "Planning",
  "email-inbound": "Inkomende e-mail",
  generation: "Generatie",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

function snippet(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

function SectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-foreground/20 pb-2 mb-5">
      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
        {label}
      </span>
      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function AlertRow({
  alert,
  onResolve,
  resolving,
}: {
  alert: SystemAlert;
  onResolve: (id: number) => void;
  resolving: boolean;
}) {
  const isError = alert.severity === "error";
  return (
    <div
      className="border border-foreground bg-card px-4 py-4 flex items-start gap-4"
      data-testid={`alert-row-${alert.id}`}
    >
      <AlertTriangle
        className={`w-5 h-5 shrink-0 mt-0.5 ${
          isError ? "text-destructive" : "text-amber-700"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span
            className={`font-['Space_Mono'] text-[9px] uppercase tracking-widest px-2 py-0.5 border ${
              isError
                ? "border-destructive text-destructive"
                : "border-amber-700 text-amber-700"
            }`}
          >
            {isError ? "Fout" : "Waarschuwing"}
          </span>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest px-2 py-0.5 border border-foreground/40 text-muted-foreground">
            {sourceLabel(alert.source)}
          </span>
          {alert.occurrences > 1 && (
            <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
              {alert.occurrences}× herhaald
            </span>
          )}
        </div>
        <p className="font-['Inter'] text-sm text-foreground break-words">
          {alert.message}
        </p>
        <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-1.5">
          Laatst: {formatDate(alert.lastSeenAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onResolve(alert.id)}
        disabled={resolving}
        data-testid={`button-resolve-alert-${alert.id}`}
        title="Markeer als opgelost"
        className="shrink-0 py-2 px-3 border-2 border-foreground text-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        {resolving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5" />
        )}
        Opgelost
      </button>
    </div>
  );
}

function ApprovalRow({ approval }: { approval: PendingApproval }) {
  return (
    <Link
      href={`/history?id=${approval.generationId}`}
      data-testid={`approval-row-${approval.generationId}`}
      className="group border border-foreground bg-card px-4 py-4 flex items-start gap-4 hover:bg-foreground hover:text-background transition-colors"
    >
      <MailCheck className="w-5 h-5 shrink-0 mt-0.5 text-accent group-hover:text-background" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="block font-['Playfair_Display'] font-bold text-lg leading-tight truncate">
            {approval.clientName ?? "Intern"}
          </span>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest shrink-0 pt-1 text-muted-foreground group-hover:text-background/60">
            {formatDate(approval.createdAt)}
          </span>
        </div>
        <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent group-hover:text-background/70 mt-1">
          {kindLabel(approval.kind)} · {approval.workflowTitle}
        </p>
      </div>
      <ArrowUpRight className="w-4 h-4 shrink-0 mt-1 text-muted-foreground group-hover:text-background" />
    </Link>
  );
}

function ProposalRow({ proposal }: { proposal: ImprovementProposal }) {
  return (
    <Link
      href={`/history?id=${proposal.generationId}`}
      data-testid={`proposal-row-${proposal.id}`}
      className="group border border-foreground bg-card px-4 py-4 flex items-start gap-4 hover:bg-foreground hover:text-background transition-colors"
    >
      <Lightbulb className="w-5 h-5 shrink-0 mt-0.5 text-accent group-hover:text-background" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="block font-['Playfair_Display'] font-bold text-base leading-tight truncate">
            {proposal.targetLabel}
          </span>
          <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest shrink-0 pt-1 text-muted-foreground group-hover:text-background/60">
            {proposal.targetType === "client" ? "Klant" : "Standaard"}
          </span>
        </div>
        <p className="font-['Inter'] text-sm text-muted-foreground group-hover:text-background/70 mt-1 line-clamp-2">
          {snippet(proposal.rationale)}
        </p>
      </div>
      <ArrowUpRight className="w-4 h-4 shrink-0 mt-1 text-muted-foreground group-hover:text-background" />
    </Link>
  );
}

export default function Todo() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetTodoOverview();
  const resolveMut = useResolveAlert();

  const alerts = data?.unresolvedAlerts ?? [];
  const approvals = data?.pendingApprovals ?? [];
  const proposals = data?.pendingProposals ?? [];
  const total = alerts.length + approvals.length + proposals.length;

  const handleResolve = (id: number) => {
    resolveMut.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetTodoOverviewQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter']">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Te doen laden...
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
            Overzicht onbereikbaar
          </h1>
          <p className="text-sm text-muted-foreground">
            Kon het takenoverzicht niet laden. Controleer je verbinding of de
            API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-16">
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Saerens Advertising — Werkbank
                </p>
                <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
                  Te doen
                </h1>
              </div>
              <div className="text-right hidden sm:block shrink-0">
                <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Openstaand
                </div>
                <div className="font-['Playfair_Display'] text-2xl italic leading-none mt-1">
                  No. {String(total).padStart(3, "0")}
                </div>
              </div>
            </div>
            <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
              Alles wat op jou wacht, op één plek: storingen die aandacht vragen,
              concepten die op je akkoord wachten en voorgestelde regels die je
              kan aanvaarden of weigeren.
            </p>
          </header>
        </Reveal>

        {total === 0 ? (
          <Reveal>
            <div className="flex flex-col items-center justify-center gap-4 text-center border border-dashed border-foreground/30 bg-card py-24 px-6">
              <CheckCircle2 className="w-10 h-10 text-accent" />
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                Niets te doen
              </p>
              <p className="text-sm text-muted-foreground max-w-sm font-['Inter']">
                Alles is afgehandeld. Nieuwe storingen, goedkeuringen en
                voorstellen verschijnen hier automatisch.
              </p>
            </div>
          </Reveal>
        ) : (
          <div className="flex flex-col gap-12">
            {alerts.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader label="Storingen" count={alerts.length} />
                  <div className="flex flex-col gap-3">
                    {alerts.map((a) => (
                      <AlertRow
                        key={a.id}
                        alert={a}
                        onResolve={handleResolve}
                        resolving={
                          resolveMut.isPending &&
                          resolveMut.variables?.id === a.id
                        }
                      />
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            {approvals.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader
                    label="Wacht op goedkeuring"
                    count={approvals.length}
                  />
                  <div className="flex flex-col gap-3">
                    {approvals.map((a) => (
                      <ApprovalRow key={a.generationId} approval={a} />
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            {proposals.length > 0 && (
              <Reveal>
                <section>
                  <SectionHeader
                    label="Voorgestelde regels"
                    count={proposals.length}
                  />
                  <div className="flex flex-col gap-3">
                    {proposals.map((p) => (
                      <ProposalRow key={p.id} proposal={p} />
                    ))}
                  </div>
                </section>
              </Reveal>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
