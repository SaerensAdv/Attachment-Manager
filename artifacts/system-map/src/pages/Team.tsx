import { useEffect, useMemo, useState } from "react";
import {
  useGetTeam,
  useGetDocGraph,
  type TeamMember,
  type DocNode,
} from "@workspace/api-client-react";
import { Loader2, ArrowLeft, ArrowRight, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Reveal from "@/components/Reveal";

const KIND_LABEL: Record<string, string> = {
  routing: "routeert naar",
  flow: "voedt",
  reference: "verwijst naar",
  mention: "vermeldt",
};

// Persona fields shown in the profile dossier, in reading order.
const PERSONA_FIELDS: { key: keyof TeamMember; label: string }[] = [
  { key: "personality", label: "Persoonlijkheid" },
  { key: "communicationStyle", label: "Communicatie" },
  { key: "caresMostAbout", label: "Hecht het meest aan" },
  { key: "signatureHabit", label: "Kenmerkende gewoonte" },
  { key: "culturalFitNote", label: "Culturele match" },
];

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

interface ProfileProps {
  member: TeamMember;
  nodes: DocNode[];
  edges: { source: string; target: string; kind: string }[];
  onClose: () => void;
}

function Profile({ member, nodes, edges, onClose }: ProfileProps) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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
          <Portrait member={member} size="lg" />
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
        <button
          onClick={onClose}
          className="p-2 border border-foreground hover:bg-foreground hover:text-background transition-colors shrink-0"
          aria-label="Sluiten"
          data-testid="button-close-profile"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem]">
        {/* Persona */}
        <div className="p-6 border-b lg:border-b-0 lg:border-r border-foreground/20">
          <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider border-b-2 border-foreground pb-1 mb-5">
            Persona
          </h3>
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

  // The team grouped by leadership head (the reporting line from AGENTS.md), in
  // fixed top-to-bottom order. Members keep their alphabetical order within a
  // head; empty heads are simply absent. Each card still shows its function layer
  // as a caption, so both the reporting line and the kind of work stay visible.
  const heads = useMemo(() => {
    const byId = new Map<
      string,
      { head: TeamMember["head"]; members: TeamMember[] }
    >();
    for (const member of employees) {
      const group = byId.get(member.head.id);
      if (group) {
        group.members.push(member);
      } else {
        byId.set(member.head.id, { head: member.head, members: [member] });
      }
    }
    return [...byId.values()].sort((a, b) => a.head.order - b.head.order);
  }, [employees]);

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
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Saerens Advertising — Redactie
                </p>
                <h1 className="font-['Playfair_Display'] font-black text-4xl md:text-5xl uppercase tracking-tight leading-none">
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
            Rapportagelijn: specialisten → head → Orchestrator → CEO
          </p>
        </Reveal>

        {/* Roster grouped per leadership head, top to bottom */}
        <div className="flex flex-col gap-14">
          {heads.map(({ head, members }) => (
            <section key={head.id}>
              <Reveal>
                <div className="flex items-baseline gap-4 border-b-2 border-foreground pb-3 mb-7">
                  <span className="font-['Playfair_Display'] font-black text-3xl italic leading-none text-foreground/30 shrink-0">
                    {String(head.order).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-['Playfair_Display'] font-black text-2xl md:text-3xl uppercase tracking-tight leading-none">
                      {head.title}
                    </h2>
                    <p className="font-['Inter'] text-sm text-muted-foreground mt-2 max-w-2xl">
                      {head.description}
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
                          <span className="inline-block mt-3 font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground/80 border border-foreground/20 px-1.5 py-0.5">
                            {member.layer.title}
                          </span>
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
