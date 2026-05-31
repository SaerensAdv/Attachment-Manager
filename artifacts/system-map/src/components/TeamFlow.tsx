import { Fragment, useEffect, useRef, useState } from "react";
import { Waypoints, Check, ChevronRight, RotateCcw } from "lucide-react";

export interface FlowAgent {
  path: string;
  title: string;
  role: "lead" | "member";
  status: "queued" | "working" | "done";
  durationMs?: number;
}

interface TeamFlowProps {
  agents: FlowAgent[];
  orchestrator: {
    taskType: string | null;
    durationMs?: number | null;
  };
  isStreaming: boolean;
}

type NodeStatus = "queued" | "working" | "done";

const ORCH_COLOR = "hsl(var(--cat-core))";
const LEAD_COLOR = "hsl(var(--accent))";
const MEMBER_COLOR = "hsl(var(--cat-agent))";

// Dutch-style short duration label: "2,4 s" or "1m 12s".
function fmtDur(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * A run-scoped view of the agent team: the Orchestrator that routed the request
 * followed by each agent in hand-off order. Nodes light up live (queued →
 * working → done) and the active hand-off streams light beads from one agent to
 * the next, reusing the atlas "living pipeline" visual language. After a run the
 * sequence can be replayed and read back as a timeline.
 */
export default function TeamFlow({
  agents,
  orchestrator,
  isStreaming,
}: TeamFlowProps) {
  // Replay walks a playhead across the chain so the user can re-watch the
  // hand-off sequence after a run finishes. -1 means "not replaying".
  const [replayStep, setReplayStep] = useState<number>(-1);
  const replaying = replayStep >= 0;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = agents.length + 1; // +1 for the orchestrator at index 0
  const allDone = agents.length > 0 && agents.every((a) => a.status === "done");
  const canReplay = !isStreaming && allDone;

  // Abort any running replay if a fresh generation kicks off.
  useEffect(() => {
    if (isStreaming && replaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setReplayStep(-1);
    }
  }, [isStreaming, replaying]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startReplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setReplayStep(0);
    timerRef.current = setInterval(() => {
      setReplayStep((s) => {
        if (s >= total) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return -1;
        }
        return s + 1;
      });
    }, 850);
  };

  // Effective status for global node index gi (0 = orchestrator, 1.. = agents).
  const effStatus = (gi: number): NodeStatus => {
    if (replaying) {
      if (gi < replayStep) return "done";
      if (gi === replayStep) return "working";
      return "queued";
    }
    if (gi === 0) return "done"; // orchestrator already routed
    return agents[gi - 1].status;
  };

  const nodes = [
    {
      key: "orchestrator",
      title: "Orchestrator",
      isOrch: true as const,
      color: ORCH_COLOR,
    },
    ...agents.map((a, i) => ({
      key: `${a.path}-${i}`,
      title: a.title,
      isOrch: false as const,
      color: a.role === "lead" ? LEAD_COLOR : MEMBER_COLOR,
      agentIdx: i,
    })),
  ];

  const subLabel = (gi: number): string => {
    const st = effStatus(gi);
    if (st === "working") return "Bezig…";
    if (st === "queued") return "Wacht";
    if (gi === 0) return fmtDur(orchestrator.durationMs) ?? "Routeert";
    const role = agents[gi - 1].role === "lead" ? "Hoofd" : "Steun";
    const dur = fmtDur(agents[gi - 1].durationMs);
    return dur ? `${role} · ${dur}` : role;
  };

  return (
    <div
      data-testid="team-flow"
      className="border border-foreground/15 bg-background/60 p-5 lg:p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h3 className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-muted-foreground">
            De redactievloer
          </h3>
          <p className="font-['Playfair_Display'] text-lg font-bold tracking-tight leading-tight">
            Zo geeft het team het werk door
          </p>
        </div>
        {canReplay && (
          <button
            type="button"
            onClick={startReplay}
            disabled={replaying}
            data-testid="button-replay-flow"
            className="shrink-0 inline-flex items-center gap-1.5 border border-foreground px-3 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <RotateCcw className={`w-3 h-3 ${replaying ? "animate-spin" : ""}`} />
            {replaying ? "Afspelen…" : "Opnieuw afspelen"}
          </button>
        )}
      </div>

      {/* Flow diagram — orchestrator + agents in hand-off order */}
      <div className="flex items-start overflow-x-auto pb-2">
        {nodes.map((n, gi) => {
          const st = effStatus(gi);
          const dimmed = st === "queued";
          return (
            <Fragment key={n.key}>
              {gi > 0 && <Connector state={st} />}
              <div
                data-testid={`flow-node-${gi}`}
                className={`flex flex-col items-center w-[88px] shrink-0 text-center transition-opacity duration-300 ${
                  dimmed ? "opacity-40" : "opacity-100"
                }`}
              >
                <div className="h-14 flex items-center justify-center">
                  <div
                    className={`relative w-12 h-12 transition-transform duration-300 ${
                      st === "working" ? "scale-110" : ""
                    }`}
                  >
                    {st === "working" && (
                      <span
                        className="absolute inset-0 rounded-full animate-ping"
                        style={{ backgroundColor: n.color, opacity: 0.3 }}
                      />
                    )}
                    <div
                      className="absolute inset-0 rounded-full bg-card border-2 flex items-center justify-center shadow-[2px_2px_0px_hsl(var(--foreground))]"
                      style={{ borderColor: n.color }}
                    >
                      {n.isOrch ? (
                        <Waypoints
                          className="w-5 h-5"
                          style={{ color: n.color }}
                        />
                      ) : (
                        <span
                          className="font-['Space_Mono'] text-sm font-bold"
                          style={{ color: n.color }}
                        >
                          {n.agentIdx + 1}
                        </span>
                      )}
                    </div>
                    {st === "done" && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-600 flex items-center justify-center ring-2 ring-background">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </div>
                </div>
                <span className="mt-2 font-['Space_Mono'] text-[10px] uppercase tracking-wider leading-tight line-clamp-2 min-h-[24px]">
                  {n.title}
                </span>
                <span
                  className={`mt-1 text-[10px] italic ${
                    st === "working" ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {subLabel(gi)}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Recap timeline — readable summary of who did what, in order */}
      {(allDone || replaying) && (
        <ol className="mt-6 border-t border-foreground/15" data-testid="flow-timeline">
          <TimelineRow
            index="00"
            title="Orchestrator"
            duration={fmtDur(orchestrator.durationMs)}
            text={
              "Las de opdracht en stelde het team samen" +
              (orchestrator.taskType
                ? ` — taak herkend als “${orchestrator.taskType}”.`
                : ".")
            }
          />
          {agents.map((a, i) => {
            const role =
              a.role === "lead" ? "Hoofdredacteur" : "Ondersteunend";
            const handoff =
              i === agents.length - 1
                ? "Leverde de eindversie."
                : `Gaf het werk door aan ${agents[i + 1].title}.`;
            return (
              <TimelineRow
                key={`${a.path}-${i}`}
                index={String(i + 1).padStart(2, "0")}
                title={a.title}
                duration={fmtDur(a.durationMs)}
                text={`${role}. ${handoff}`}
              />
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Connector({ state }: { state: NodeStatus }) {
  const active = state === "working";
  const done = state === "done";
  return (
    <div className="flex-1 min-w-[24px] max-w-[72px] h-14 flex items-center">
      <div className="relative w-full h-1.5">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-foreground/25" />
        {done && (
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px]"
            style={{ backgroundColor: "hsl(var(--cat-agent))" }}
          />
        )}
        {active && <div className="absolute inset-0 flow-beads" />}
        <ChevronRight
          className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3"
          style={{
            color: active
              ? "hsl(var(--accent))"
              : done
                ? "hsl(var(--cat-agent))"
                : "hsl(var(--foreground) / 0.4)",
          }}
        />
      </div>
    </div>
  );
}

function TimelineRow({
  index,
  title,
  duration,
  text,
}: {
  index: string;
  title: string;
  duration: string | null;
  text: string;
}) {
  return (
    <li className="flex gap-4 py-3 border-b border-foreground/10">
      <span className="font-['Space_Mono'] text-[11px] text-muted-foreground shrink-0 pt-0.5">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-['Space_Mono'] text-xs uppercase tracking-wider font-bold truncate">
            {title}
          </span>
          {duration && (
            <span className="font-['Space_Mono'] text-[10px] text-muted-foreground tabular-nums shrink-0">
              {duration}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-['Inter'] leading-snug mt-0.5">
          {text}
        </p>
      </div>
    </li>
  );
}
