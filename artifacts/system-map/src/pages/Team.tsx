import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetTeam,
  useGetDocGraph,
  useGetAgentStats,
  useGetAgentRuns,
  useUpdateAgentPersona,
  useUploadAgentPortrait,
  getGetTeamQueryKey,
  getGetDocGraphQueryKey,
  type TeamMember,
  type DocNode,
  type AgentRun,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  X,
  Activity,
  Pencil,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import Reveal from "@/components/Reveal";

const KIND_LABEL: Record<string, string> = {
  routing: "routeert naar",
  flow: "voedt",
  reference: "verwijst naar",
  mention: "vermeldt",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  completed: "Voltooid",
  partial: "Gedeeltelijk",
};

const TRIGGER_LABEL: Record<string, string> = {
  user: "Handmatig",
  auto: "Autonoom",
  scheduled: "Gepland",
};

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

// Short Dutch date for a run row.
function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Persona bullet fields shown in the profile dossier, in reading order. The key
// matches both the TeamMember field and the persona PUT body field.
type PersonaFieldKey =
  | "personality"
  | "communicationStyle"
  | "caresMostAbout"
  | "signatureHabit"
  | "culturalFitNote";

const PERSONA_FIELDS: { key: PersonaFieldKey; label: string }[] = [
  { key: "personality", label: "Persoonlijkheid" },
  { key: "communicationStyle", label: "Communicatie" },
  { key: "caresMostAbout", label: "Hecht het meest aan" },
  { key: "signatureHabit", label: "Kenmerkende gewoonte" },
  { key: "culturalFitNote", label: "Culturele match" },
];

// Read a file as a base64 data-URL so it can ride in the JSON portrait body.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function initialsOf(member: TeamMember): string {
  const base = member.name?.trim() || member.title.trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Portrait({
  member,
  size,
}: {
  member: TeamMember;
  size: "sm" | "lg";
}) {
  const dim = size === "lg" ? "w-28 h-28" : "w-16 h-16";
  const text = size === "lg" ? "text-3xl" : "text-xl";
  // The thumbnail (256px WebP) is plenty for both the roster avatar and the
  // larger profile portrait, so faces appear instantly without the ~1.3MB load.
  const src = member.portraitThumbUrl ?? member.portraitUrl;
  if (src) {
    return (
      <img
        src={src}
        alt={member.name ?? member.title}
        className={`${dim} rounded-full object-cover border-2 border-foreground shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full border-2 border-foreground bg-foreground/5 flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <span
        className={`font-['Playfair_Display'] font-black ${text} text-foreground/70 leading-none`}
      >
        {initialsOf(member)}
      </span>
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-foreground/20 bg-background/40 px-3 py-3">
      <div className="font-['Playfair_Display'] font-black text-2xl leading-none">
        {value}
      </div>
      <div className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mt-1.5">
        {label}
      </div>
    </div>
  );
}

// KPIs + recent run history for one agent, fetched lazily when the dossier
// opens. This is the "see afterward what happened" surface — it also links each
// run through to its full audit trail in the archive.
function AgentDossier({ slug }: { slug: string }) {
  const { data: stats } = useGetAgentStats(slug);
  const { data: runsData } = useGetAgentRuns(slug);
  const runs: AgentRun[] = runsData?.runs ?? [];

  return (
    <div className="border-t-2 border-foreground p-6 bg-background/30">
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-4 h-4 text-accent" />
        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
          Activiteit & prestaties
        </h3>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          <KpiCell label="Runs geleid" value={String(stats.runsLed)} />
          <KpiCell
            label="Deelgenomen"
            value={String(stats.runsParticipated)}
          />
          <KpiCell
            label="Gem. duur"
            value={formatDuration(stats.avgDurationMs)}
          />
          <KpiCell
            label="Tokens (out)"
            value={formatTokens(stats.totalOutputTokens)}
          />
          <KpiCell label="Goedgekeurd" value={String(stats.approved)} />
          <KpiCell label="Afgekeurd" value={String(stats.rejected)} />
          <KpiCell label="In afwachting" value={String(stats.pending)} />
          <KpiCell
            label="Laatst actief"
            value={
              stats.lastActiveAt ? formatRunDate(stats.lastActiveAt) : "—"
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground mb-7">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
            KPI's laden...
          </span>
        </div>
      )}

      <h4 className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3 border-b border-foreground/20 pb-1">
        Recente runs
      </h4>
      {runs.length === 0 ? (
        <p className="font-['Inter'] text-sm text-muted-foreground italic">
          Nog geen runs vastgelegd voor dit teamlid.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/10">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/history?id=${run.id}`}
                className="group flex items-center gap-3 py-2.5 hover:bg-foreground/5 -mx-2 px-2 transition-colors"
                data-testid={`run-${run.id}`}
              >
                <span
                  className={`font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0 ${
                    run.role === "lead"
                      ? "border-foreground text-foreground"
                      : "border-foreground/40 text-muted-foreground"
                  }`}
                >
                  {run.role === "lead" ? "Lead" : "Teamlid"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-['Inter'] text-sm font-medium text-foreground truncate group-hover:text-accent">
                    {run.clientName} · {run.workflowTitle}
                  </span>
                  <span className="block font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {formatRunDate(run.createdAt)} ·{" "}
                    {RUN_STATUS_LABEL[run.status] ?? run.status} ·{" "}
                    {TRIGGER_LABEL[run.triggerSource] ?? run.triggerSource}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ProfileProps {
  member: TeamMember;
  nodes: DocNode[];
  edges: { source: string; target: string; kind: string }[];
  onClose: () => void;
}

// All editable persona fields collapsed into one flat form-state shape.
type PersonaForm = Record<PersonaFieldKey, string> & {
  name: string;
  oneLiner: string;
  roleSummary: string;
};

// One labelled editorial input row for the persona editor; single-line by
// default, multiline for longer prose fields.
function PersonaInput({
  label,
  value,
  onChange,
  multiline = false,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  testId: string;
}) {
  const shared =
    "w-full border border-foreground/30 bg-background/60 px-3 py-2 font-['Inter'] text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent";
  return (
    <label className="block">
      <span className="block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={`${shared} resize-y leading-relaxed`}
          data-testid={testId}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
          data-testid={testId}
        />
      )}
    </label>
  );
}

function formFromMember(member: TeamMember): PersonaForm {
  return {
    name: member.name ?? "",
    oneLiner: member.oneLiner ?? "",
    roleSummary: member.roleSummary ?? "",
    personality: member.personality ?? "",
    communicationStyle: member.communicationStyle ?? "",
    caresMostAbout: member.caresMostAbout ?? "",
    signatureHabit: member.signatureHabit ?? "",
    culturalFitNote: member.culturalFitNote ?? "",
  };
}

function Profile({ member, nodes, edges, onClose }: ProfileProps) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PersonaForm>(() => formFromMember(member));
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePersona = useUpdateAgentPersona();
  const uploadPortrait = useUploadAgentPortrait();
  const isUploading = uploadPortrait.isPending;

  // Refresh the roster + the map (titles/connections feed off the same docs)
  // after any write so the new persona/portrait shows up everywhere at once.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDocGraphQueryKey() });
  };

  // Re-seed the form whenever a different member is opened, and drop edit mode
  // so you never carry one agent's draft onto another.
  useEffect(() => {
    setForm(formFromMember(member));
    setEditing(false);
    setSaveError(null);
  }, [member]);

  const startEditing = () => {
    setForm(formFromMember(member));
    setSaveError(null);
    setEditing(true);
  };

  const updateField = (key: keyof PersonaForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaveError(null);
    try {
      await updatePersona.mutateAsync({ slug: member.slug, data: form });
      invalidateAll();
      setEditing(false);
    } catch {
      setSaveError("Opslaan mislukt. Probeer het opnieuw.");
    }
  };

  const handlePortraitFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setSaveError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      await uploadPortrait.mutateAsync({
        slug: member.slug,
        data: { imageBase64: dataUrl },
      });
      invalidateAll();
    } catch {
      setSaveError("Portret uploaden mislukt. Probeer een ander beeld.");
    }
  };

  // Direct graph connections for this agent, derived from the doc-graph edges.
  const { outgoing, incoming } = useMemo(() => {
    const out: { node: DocNode; kind: string }[] = [];
    const inc: { node: DocNode; kind: string }[] = [];
    for (const e of edges) {
      if (e.source === member.path) {
        const t = nodeById.get(e.target);
        if (t) out.push({ node: t, kind: e.kind });
      } else if (e.target === member.path) {
        const s = nodeById.get(e.source);
        if (s) inc.push({ node: s, kind: e.kind });
      }
    }
    return { outgoing: out, incoming: inc };
  }, [edges, member.path, nodeById]);

  const personaRows = PERSONA_FIELDS.map((f) => ({
    label: f.label,
    value: member[f.key] as string | null,
  })).filter((r) => r.value);

  const renderConnections = (
    items: { node: DocNode; kind: string }[],
    label: string,
    Icon: typeof ArrowRight,
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 text-[10px] font-['Space_Mono'] uppercase tracking-[0.2em] text-muted-foreground mb-2 border-b border-foreground/20 pb-1">
          <Icon className="w-3.5 h-3.5" />
          {label} ({items.length})
        </div>
        <div className="flex flex-col">
          {items.map(({ node: n, kind }) => (
            <div
              key={`${label}-${n.id}-${kind}`}
              className="flex items-center gap-2 px-2 py-1.5 border-l-2 border-transparent"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(var(--cat-${n.category}))` }}
              />
              <span className="font-['Inter'] text-sm truncate flex-1">
                {n.title}
              </span>
              <span className="text-[10px] font-['Space_Mono'] uppercase tracking-wider text-muted-foreground/70 shrink-0">
                {KIND_LABEL[kind] ?? kind}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="border border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))]">
      {/* Dossier header */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-foreground px-6 py-5">
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative shrink-0">
            <Portrait member={member} size="lg" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handlePortraitFile}
              data-testid="input-portrait-file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute -bottom-1 -right-1 p-1.5 border border-foreground bg-background hover:bg-foreground hover:text-background transition-colors disabled:opacity-60"
              aria-label="Portret uploaden"
              title="Portret uploaden"
              data-testid="button-upload-portrait"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="min-w-0">
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
              {member.title}
            </p>
            <h2 className="font-['Playfair_Display'] font-black text-3xl uppercase tracking-tight leading-none mt-2 truncate">
              {member.name ?? member.title}
            </h2>
            {member.oneLiner && (
              <p className="font-['Playfair_Display'] italic text-lg text-foreground/80 mt-2">
                "{member.oneLiner}"
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 px-3 py-2 border border-foreground hover:bg-foreground hover:text-background transition-colors font-['Space_Mono'] text-[10px] uppercase tracking-widest"
              data-testid="button-edit-persona"
            >
              <Pencil className="w-3.5 h-3.5" />
              Bewerken
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 border border-foreground hover:bg-foreground hover:text-background transition-colors"
            aria-label="Sluiten"
            data-testid="button-close-profile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem]">
        {/* Persona */}
        <div className="p-6 border-b lg:border-b-0 lg:border-r border-foreground/20">
          <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider border-b-2 border-foreground pb-1 mb-5">
            Persona
          </h3>
          {editing ? (
            <div className="flex flex-col gap-4">
              <PersonaInput
                label="Naam"
                value={form.name}
                onChange={(v) => updateField("name", v)}
                testId="input-persona-name"
              />
              <PersonaInput
                label="In een zin"
                value={form.oneLiner}
                onChange={(v) => updateField("oneLiner", v)}
                testId="input-persona-oneliner"
              />
              <PersonaInput
                label="Rol (eerste alinea)"
                value={form.roleSummary}
                onChange={(v) => updateField("roleSummary", v)}
                multiline
                testId="input-persona-role"
              />
              {PERSONA_FIELDS.map((f) => (
                <PersonaInput
                  key={f.key}
                  label={f.label}
                  value={form[f.key]}
                  onChange={(v) => updateField(f.key, v)}
                  multiline
                  testId={`input-persona-${f.key}`}
                />
              ))}

              {saveError && (
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive">
                  {saveError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={updatePersona.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 border border-foreground bg-foreground text-background hover:bg-accent hover:border-accent transition-colors font-['Space_Mono'] text-[10px] uppercase tracking-widest disabled:opacity-60"
                  data-testid="button-save-persona"
                >
                  {updatePersona.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Opslaan
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setSaveError(null);
                  }}
                  disabled={updatePersona.isPending}
                  className="px-4 py-2 border border-foreground hover:bg-foreground hover:text-background transition-colors font-['Space_Mono'] text-[10px] uppercase tracking-widest disabled:opacity-60"
                  data-testid="button-cancel-persona"
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <>
              {member.roleSummary && (
                <p className="font-['Inter'] text-sm text-foreground leading-relaxed mb-6">
                  {member.roleSummary}
                </p>
              )}
              {personaRows.length > 0 ? (
                <dl className="flex flex-col gap-4">
                  {personaRows.map((r) => (
                    <div key={r.label}>
                      <dt className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        {r.label}
                      </dt>
                      <dd className="font-['Inter'] text-sm text-foreground leading-relaxed">
                        {r.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="font-['Inter'] text-sm text-muted-foreground italic">
                  Nog geen persona vastgelegd voor dit teamlid.
                </p>
              )}
            </>
          )}
        </div>

        {/* Connections */}
        <div className="p-6">
          <h3 className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
            Verbindingen
          </h3>
          {outgoing.length === 0 && incoming.length === 0 ? (
            <p className="font-['Inter'] text-sm text-muted-foreground italic">
              Geen verbindingen in de kaart.
            </p>
          ) : (
            <>
              {renderConnections(outgoing, "Verwijst naar", ArrowRight)}
              {renderConnections(incoming, "Verwezen vanuit", ArrowLeft)}
            </>
          )}
        </div>
      </div>

      {/* Activity & KPIs */}
      <AgentDossier slug={member.slug} />
    </div>
  );
}

export default function Team() {
  const { data: teamData, isLoading, error } = useGetTeam();
  const { data: graphData } = useGetDocGraph();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const employees = useMemo(
    () =>
      [...(teamData?.employees ?? [])].sort((a, b) =>
        (a.name ?? a.title).localeCompare(b.name ?? b.title, "nl"),
      ),
    [teamData],
  );

  const selected = useMemo(
    () => employees.find((e) => e.slug === selectedSlug) ?? null,
    [employees, selectedSlug],
  );

  const reduceMotion = useReducedMotion();

  // While a profile floats over the page, lock body scroll and let Escape close
  // it, so the dossier behaves like a proper overlay regardless of scroll spot.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedSlug(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  // The team grouped by department (the single agency org model from AGENTS.md),
  // in fixed order. Members keep their alphabetical order within a department;
  // the department's owner (head) is floated to the front and badged. Empty
  // departments are simply absent.
  const departments = useMemo(() => {
    const byId = new Map<
      string,
      { department: TeamMember["department"]; members: TeamMember[] }
    >();
    for (const member of employees) {
      const group = byId.get(member.department.id);
      if (group) {
        group.members.push(member);
      } else {
        byId.set(member.department.id, {
          department: member.department,
          members: [member],
        });
      }
    }
    for (const group of byId.values()) {
      group.members.sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
    }
    return [...byId.values()].sort(
      (a, b) => a.department.order - b.department.order,
    );
  }, [employees]);

  // Spell the department count in Dutch for the reporting-line note, so the
  // copy always matches however many departments AGENTS.md actually declares.
  const departmentCountLabel = useMemo(() => {
    const words = [
      "nul",
      "één",
      "twee",
      "drie",
      "vier",
      "vijf",
      "zes",
      "zeven",
      "acht",
      "negen",
      "tien",
    ];
    return words[departments.length] ?? String(departments.length);
  }, [departments]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter']">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Redactie laden...
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
            Team onbereikbaar
          </h1>
          <p className="text-sm text-muted-foreground">
            Kon de teamleden niet laden. Controleer je verbinding of de
            API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Saerens Advertising — Redactie
                </p>
                <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
                  Het Team
                </h1>
              </div>
              <div className="text-right hidden sm:block shrink-0">
                <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Koppen
                </div>
                <div className="font-['Playfair_Display'] text-2xl italic leading-none mt-1">
                  No. {String(employees.length).padStart(3, "0")}
                </div>
              </div>
            </div>
            <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
              De volledige redactie van het AI-team. Klik op een kop voor de
              volledige persona en de verbindingen in de kaart.
            </p>
          </header>
        </Reveal>

        {/* Reporting-line note */}
        <Reveal>
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-8">
            Eén bureau, {departmentCountLabel} afdelingen: specialisten →
            eigenaar (head) → Orchestrator → CEO
          </p>
        </Reveal>

        {/* Roster grouped per department, in fixed order */}
        <div className="flex flex-col gap-14">
          {departments.map(({ department, members }) => (
            <section key={department.id}>
              <Reveal>
                <div className="flex items-baseline gap-4 border-b-2 border-foreground pb-3 mb-7">
                  <span
                    className="font-['Playfair_Display'] font-black text-3xl italic leading-none shrink-0"
                    style={{ color: `hsl(var(--dept-${department.id}))` }}
                  >
                    {String(department.order).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-['Playfair_Display'] font-black text-2xl md:text-3xl uppercase tracking-tight leading-none">
                      {department.title}
                    </h2>
                    <p className="font-['Inter'] text-sm text-muted-foreground mt-2 max-w-2xl">
                      {department.description}
                    </p>
                  </div>
                </div>
              </Reveal>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {members.map((member, i) => {
                  const active = member.slug === selectedSlug;
                  return (
                    <Reveal key={member.slug} delay={Math.min(i * 0.03, 0.3)}>
                      <button
                        onClick={() =>
                          setSelectedSlug((cur) =>
                            cur === member.slug ? null : member.slug,
                          )
                        }
                        data-testid={`team-card-${member.slug}`}
                        className={`group w-full h-full text-left border border-foreground bg-card p-5 flex items-start gap-4 transition-all shadow-[4px_4px_0px_hsl(var(--foreground))] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_hsl(var(--accent))] active:translate-x-1 active:translate-y-1 active:shadow-none ${
                          active ? "ring-2 ring-accent" : ""
                        }`}
                      >
                        <Portrait member={member} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                            {member.title}
                          </p>
                          <h3 className="font-['Playfair_Display'] font-bold text-xl leading-tight tracking-tight mt-1 truncate">
                            {member.name ?? member.title}
                          </h3>
                          {member.oneLiner && (
                            <p className="font-['Inter'] text-sm text-muted-foreground mt-2 line-clamp-2">
                              {member.oneLiner}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                              className="inline-block font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border"
                              style={{
                                color: `hsl(var(--dept-${member.department.id}))`,
                                borderColor: `hsl(var(--dept-${member.department.id}) / 0.5)`,
                              }}
                            >
                              {member.department.title}
                            </span>
                            {member.isOwner && (
                              <span className="inline-block font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-foreground text-background">
                                Head
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Floating profile dossier — appears over the page so you never have to
          scroll back up to read a member you clicked further down the roster. */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[60] flex overflow-y-auto bg-foreground/40 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setSelectedSlug(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Profiel van ${selected.name ?? selected.title}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          >
            <motion.div
              className="m-auto w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
              initial={
                reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 16, scale: 0.98 }
              }
              transition={{
                duration: reduceMotion ? 0 : 0.28,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Profile
                member={selected}
                nodes={graphData?.nodes ?? []}
                edges={graphData?.edges ?? []}
                onClose={() => setSelectedSlug(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
