import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSchedules,
  useGetDocGraph,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useRunScheduleNow,
  getGetSchedulesQueryKey,
  type Schedule,
} from "@workspace/api-client-react";
import {
  CalendarClock,
  Loader2,
  Play,
  Trash2,
  Plus,
  Pencil,
  X,
  AlertTriangle,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import { toast } from "@/hooks/use-toast";

type Frequency = "daily" | "weekly" | "monthly";

interface Option {
  path: string;
  title: string;
}

const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Dagelijks",
  weekly: "Wekelijks (maandag)",
  monthly: "Maandelijks (1e van de maand)",
};

/** Build a cron expression from a friendly preset + HH:MM time. */
function buildCron(freq: Frequency, time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (freq === "weekly") return `${m} ${h} * * 1`;
  if (freq === "monthly") return `${m} ${h} 1 * *`;
  return `${m} ${h} * * *`;
}

/** Human-readable (Dutch) description of a cron expression we generate. */
function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [m, h, dom, , dow] = parts;
  const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  if (dom === "1" && dow === "*") return `Maandelijks op de 1e om ${time}`;
  if (dom === "*" && dow === "1") return `Wekelijks (ma) om ${time}`;
  if (dom === "*" && dow === "*") return `Dagelijks om ${time}`;
  return cron;
}

/** Parse one of our preset cron expressions back into a frequency + HH:MM. */
function parseCron(cron: string): { frequency: Frequency; time: string } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, , dow] = parts;
  const time = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  if (dom === "1" && dow === "*") return { frequency: "monthly", time };
  if (dom === "*" && dow === "1") return { frequency: "weekly", time };
  if (dom === "*" && dow === "*") return { frequency: "daily", time };
  return null;
}

const dateFmt = new Intl.DateTimeFormat("nl-BE", {
  timeZone: "Europe/Brussels",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatMoment(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}

const STATUS_LABEL: Record<string, string> = {
  completed: "Voltooid",
  partial: "Gedeeltelijk",
  failed: "Mislukt",
};

export default function Planning() {
  const queryClient = useQueryClient();
  const {
    data: schedulesData,
    isLoading: loadingSchedules,
    error: schedulesError,
  } = useGetSchedules();
  const { data: graph } = useGetDocGraph();

  const byCategory = (cat: string): Option[] =>
    (graph?.nodes ?? [])
      .filter((n) => n.category === cat)
      .map((n) => ({ path: n.path, title: n.title }))
      .sort((a, b) => a.title.localeCompare(b.title));

  const clients = useMemo(() => byCategory("client"), [graph]);
  const workflows = useMemo(() => byCategory("workflow"), [graph]);
  const agents = useMemo(
    () =>
      byCategory("agent").filter((a) => a.path !== "agents/orchestrator.md"),
    [graph],
  );

  const [name, setName] = useState("");
  const [clientPath, setClientPath] = useState("");
  const [workflowPath, setWorkflowPath] = useState("");
  const [agentPath, setAgentPath] = useState("");
  const [request, setRequest] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [time, setTime] = useState("08:00");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cronTouched, setCronTouched] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetSchedulesQueryKey() });

  const createMut = useCreateSchedule({
    mutation: {
      onSuccess: () => {
        invalidate();
        setName("");
        setRequest("");
        toast({
          title: "Planning aangemaakt",
          description: "De automatische run is ingepland.",
        });
      },
      onError: (err) =>
        toast({
          title: "Aanmaken mislukt",
          description: err instanceof Error ? err.message : "Onbekende fout.",
        }),
    },
  });

  const updateMut = useUpdateSchedule({
    mutation: { onSuccess: invalidate },
  });

  const deleteMut = useDeleteSchedule({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Planning verwijderd" });
      },
    },
  });

  const runNowMut = useRunScheduleNow({
    mutation: {
      onSuccess: (res) => {
        invalidate();
        const status = STATUS_LABEL[res.status] ?? res.status;
        toast({
          title: "Run uitgevoerd",
          description: res.error
            ? `Mislukt: ${res.error}`
            : `Resultaat: ${status}. Bekijk het in het Archief.`,
        });
      },
      onError: (err) =>
        toast({
          title: "Run mislukt",
          description: err instanceof Error ? err.message : "Onbekende fout.",
        }),
    },
  });

  const canSubmit =
    name.trim() &&
    clientPath &&
    workflowPath &&
    agentPath &&
    request.trim() &&
    /^\d{2}:\d{2}$/.test(time);

  function resetForm() {
    setName("");
    setClientPath("");
    setWorkflowPath("");
    setAgentPath("");
    setRequest("");
    setFrequency("weekly");
    setTime("08:00");
    setEditingId(null);
    setCronTouched(false);
  }

  function startEdit(s: Schedule) {
    setEditingId(s.id);
    setCronTouched(false);
    setName(s.name);
    setClientPath(s.clientPath);
    setWorkflowPath(s.workflowPath);
    setAgentPath(s.agentPath);
    setRequest(s.request);
    const parsed = parseCron(s.cronExpr);
    if (parsed) {
      setFrequency(parsed.frequency);
      setTime(parsed.time);
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (editingId !== null) {
      updateMut.mutate(
        {
          id: editingId,
          data: {
            name: name.trim(),
            // Only resend timing when the user actually changed it, so a
            // schedule with a non-preset cron keeps its original schedule.
            ...(cronTouched
              ? {
                  cronExpr: buildCron(frequency, time),
                  timezone: "Europe/Brussels",
                }
              : {}),
            agentPath,
            clientPath,
            workflowPath,
            request: request.trim(),
          },
        },
        {
          onSuccess: () => {
            resetForm();
            toast({
              title: "Planning bijgewerkt",
              description: "De wijzigingen zijn opgeslagen.",
            });
          },
          onError: (err) =>
            toast({
              title: "Bijwerken mislukt",
              description:
                err instanceof Error ? err.message : "Onbekende fout.",
            }),
        },
      );
      return;
    }
    createMut.mutate({
      data: {
        name: name.trim(),
        cronExpr: buildCron(frequency, time),
        timezone: "Europe/Brussels",
        agentPath,
        clientPath,
        workflowPath,
        request: request.trim(),
        enabled: true,
      },
    });
  }

  const schedules = schedulesData?.schedules ?? [];

  const selectClass =
    "w-full bg-background border border-foreground/30 px-3 py-2 font-['Inter'] text-sm focus:outline-none focus:border-accent";
  const labelClass =
    "font-['Space_Mono'] text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5 block";

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-16">
        <header className="border-b-2 border-foreground pb-5 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-accent" />
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Automatische runs
            </span>
          </div>
          <h1 className="font-['Playfair_Display'] font-black text-4xl md:text-5xl uppercase tracking-tight leading-none">
            Planning
          </h1>
          <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
            Plan terugkerende opdrachten in. Het team voert ze automatisch uit
            volgens het schema; de resultaten verschijnen in het Archief en
            tellen mee in het Dashboard — net als een handmatige run.
          </p>
        </header>

        <Reveal>
          <div className="flex items-start gap-3 border border-foreground/30 bg-foreground/5 px-4 py-3 mb-10">
            <AlertTriangle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <p className="font-['Inter'] text-xs text-muted-foreground leading-relaxed">
              Geplande runs vuren enkel zolang de server draait. Voor échte
              24/7-automatisering moet de app gepubliceerd zijn als een
              continu draaiende implementatie (Reserved VM), niet als een
              implementatie die bij inactiviteit afschakelt.
            </p>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-10">
          {/* Create form */}
          <Reveal>
            <form
              onSubmit={handleSubmit}
              className="border-2 border-foreground bg-card p-5 shadow-[3px_3px_0px_hsl(var(--foreground))]"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-['Playfair_Display'] font-black text-xl uppercase tracking-tight">
                  {editingId !== null ? "Planning bewerken" : "Nieuwe planning"}
                </h2>
                {editingId !== null && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex items-center gap-1 font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-cancel-edit"
                  >
                    <X className="w-3 h-3" />
                    Annuleren
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass} htmlFor="sch-name">
                    Naam
                  </label>
                  <input
                    id="sch-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="bv. Wekelijkse account-audit"
                    className={selectClass}
                    data-testid="input-schedule-name"
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="sch-client">
                    Klant
                  </label>
                  <select
                    id="sch-client"
                    value={clientPath}
                    onChange={(e) => setClientPath(e.target.value)}
                    className={selectClass}
                    data-testid="select-schedule-client"
                  >
                    <option value="">Kies een klant…</option>
                    {clients.map((c) => (
                      <option key={c.path} value={c.path}>
                        {c.title.replace(/^Client:\s*/i, "")}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} htmlFor="sch-workflow">
                    Workflow
                  </label>
                  <select
                    id="sch-workflow"
                    value={workflowPath}
                    onChange={(e) => setWorkflowPath(e.target.value)}
                    className={selectClass}
                    data-testid="select-schedule-workflow"
                  >
                    <option value="">Kies een workflow…</option>
                    {workflows.map((w) => (
                      <option key={w.path} value={w.path}>
                        {w.title.replace(/^Workflow:\s*/i, "")}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} htmlFor="sch-agent">
                    Specialist
                  </label>
                  <select
                    id="sch-agent"
                    value={agentPath}
                    onChange={(e) => setAgentPath(e.target.value)}
                    className={selectClass}
                    data-testid="select-schedule-agent"
                  >
                    <option value="">Kies een specialist…</option>
                    {agents.map((a) => (
                      <option key={a.path} value={a.path}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} htmlFor="sch-request">
                    Opdracht
                  </label>
                  <textarea
                    id="sch-request"
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    rows={3}
                    placeholder="Wat moet het team telkens doen?"
                    className={`${selectClass} resize-y`}
                    data-testid="input-schedule-request"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="sch-freq">
                      Frequentie
                    </label>
                    <select
                      id="sch-freq"
                      value={frequency}
                      onChange={(e) => {
                        setFrequency(e.target.value as Frequency);
                        setCronTouched(true);
                      }}
                      className={selectClass}
                      data-testid="select-schedule-frequency"
                    >
                      <option value="daily">Dagelijks</option>
                      <option value="weekly">Wekelijks (ma)</option>
                      <option value="monthly">Maandelijks (1e)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sch-time">
                      Tijdstip
                    </label>
                    <input
                      id="sch-time"
                      type="time"
                      value={time}
                      onChange={(e) => {
                        setTime(e.target.value);
                        setCronTouched(true);
                      }}
                      className={selectClass}
                      data-testid="input-schedule-time"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  !canSubmit || createMut.isPending || updateMut.isPending
                }
                className="mt-6 w-full flex items-center justify-center gap-2 bg-foreground text-background font-['Space_Mono'] text-[11px] uppercase tracking-widest px-4 py-3 disabled:opacity-40 hover:bg-foreground/90 transition-colors"
                data-testid="button-create-schedule"
              >
                {createMut.isPending || updateMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : editingId !== null ? (
                  <Pencil className="w-3.5 h-3.5" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {editingId !== null ? "Wijzigingen opslaan" : "Inplannen"}
              </button>
            </form>
          </Reveal>

          {/* Schedule list */}
          <Reveal>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight">
                Ingeplande runs
              </h2>
              <span className="font-['Space_Mono'] text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                {schedules.length} planning{schedules.length === 1 ? "" : "en"}
              </span>
            </div>

            {loadingSchedules ? (
              <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
                <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                  Planningen laden…
                </span>
              </div>
            ) : schedulesError ? (
              <p className="font-['Inter'] text-sm text-destructive border border-destructive/40 bg-destructive/5 px-5 py-6">
                De planningen konden niet worden geladen.
              </p>
            ) : schedules.length === 0 ? (
              <p className="font-['Inter'] text-sm text-muted-foreground italic border border-foreground/20 bg-background/40 px-5 py-10 text-center">
                Nog geen planningen. Maak er links een aan om het team
                automatisch aan het werk te zetten.
              </p>
            ) : (
              <div className="space-y-4">
                {schedules.map((s) => (
                  <ScheduleCard
                    key={s.id}
                    schedule={s}
                    editing={editingId === s.id}
                    onEdit={() => startEdit(s)}
                    onToggle={() =>
                      updateMut.mutate({
                        id: s.id,
                        data: { enabled: !s.enabled },
                      })
                    }
                    onDelete={() => deleteMut.mutate({ id: s.id })}
                    onRunNow={() => runNowMut.mutate({ id: s.id })}
                    running={
                      runNowMut.isPending && runNowMut.variables?.id === s.id
                    }
                    deleting={
                      deleteMut.isPending && deleteMut.variables?.id === s.id
                    }
                  />
                ))}
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function ScheduleCard({
  schedule: s,
  editing,
  onEdit,
  onToggle,
  onDelete,
  onRunNow,
  running,
  deleting,
}: {
  schedule: Schedule;
  editing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRunNow: () => void;
  running: boolean;
  deleting: boolean;
}) {
  const lastStatus = s.lastStatus
    ? STATUS_LABEL[s.lastStatus] ?? s.lastStatus
    : null;

  return (
    <div
      className={`border-2 bg-card p-5 shadow-[3px_3px_0px_hsl(var(--foreground))] ${
        editing ? "border-accent" : "border-foreground"
      } ${s.enabled ? "" : "opacity-60"}`}
      data-testid={`schedule-${s.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-['Playfair_Display'] font-black text-lg leading-tight truncate">
            {s.name}
          </h3>
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
            {describeCron(s.cronExpr)}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 font-['Space_Mono'] text-[9px] uppercase tracking-widest px-3 py-1.5 border ${
            s.enabled
              ? "border-foreground bg-foreground text-background"
              : "border-foreground/40 text-muted-foreground"
          }`}
          data-testid={`button-toggle-${s.id}`}
        >
          {s.enabled ? "Actief" : "Gepauzeerd"}
        </button>
      </div>

      <p className="font-['Inter'] text-sm text-foreground/80 mt-3 line-clamp-2">
        {s.request}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-4 font-['Inter'] text-xs">
        <Meta label="Klant" value={s.clientName} />
        <Meta label="Workflow" value={s.workflowTitle} />
        <Meta label="Specialist" value={s.agentTitle} />
        <Meta
          label="Volgende run"
          value={s.enabled ? formatMoment(s.nextRunAt) : "—"}
        />
      </div>

      <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-foreground/15">
        <span className="font-['Space_Mono'] text-[10px] text-muted-foreground">
          {s.lastRunAt
            ? `Laatst: ${formatMoment(s.lastRunAt)}${
                lastStatus ? ` · ${lastStatus}` : ""
              }`
            : "Nog niet uitgevoerd"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRunNow}
            disabled={running}
            className="flex items-center gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest border border-foreground px-3 py-1.5 hover:bg-foreground hover:text-background transition-colors disabled:opacity-40"
            data-testid={`button-run-now-${s.id}`}
          >
            {running ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Nu draaien
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center border border-foreground/40 text-muted-foreground p-1.5 hover:border-accent hover:text-accent transition-colors"
            aria-label="Bewerken"
            data-testid={`button-edit-${s.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="flex items-center justify-center border border-foreground/40 text-muted-foreground p-1.5 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-40"
            aria-label="Verwijderen"
            data-testid={`button-delete-${s.id}`}
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-['Space_Mono'] text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
