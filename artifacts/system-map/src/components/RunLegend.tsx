import { motion, useReducedMotion } from "framer-motion";

// Each run-state swatch mirrors exactly how the node renders on the Kaart during
// a live run (see GraphViewer): the pulsing accent halo for the writing agent,
// the slowly rotating dashed ring for queued members, the solid ink ring for
// finished ones and the faint dashed accent ring for involved-but-waiting team.
// Keeping the visuals in lock-step with the map is what makes the legend
// self-explanatory.
const SEAL_R = 6;

function Seal() {
  return (
    <>
      <circle cx={16} cy={16} r={SEAL_R} fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth={1.5} />
      <circle cx={16} cy={16} r={2.4} fill="hsl(var(--foreground))" />
    </>
  );
}

const SWATCHES: {
  id: string;
  label: string;
  hint: string;
  render: (reduced: boolean) => React.ReactNode;
}[] = [
  {
    id: "working",
    label: "Bezig",
    hint: "Schrijft nu",
    render: (reduced) => (
      <>
        <circle
          cx={16}
          cy={16}
          r={11}
          fill="hsl(var(--accent))"
          opacity={0.15}
          className={reduced ? "" : "atlas-node-pulse"}
        />
        <circle cx={16} cy={16} r={9} fill="none" stroke="hsl(var(--accent))" strokeWidth={2} opacity={0.9} />
        <Seal />
      </>
    ),
  },
  {
    id: "queued",
    label: "In wachtrij",
    hint: "Wacht op de beurt",
    render: (reduced) => (
      <>
        <circle
          cx={16}
          cy={16}
          r={9}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          opacity={0.6}
          strokeDasharray="4,5"
          className={reduced ? "" : "atlas-spin-slow"}
        />
        <Seal />
      </>
    ),
  },
  {
    id: "done",
    label: "Klaar",
    hint: "Bijdrage geleverd",
    render: () => (
      <>
        <circle cx={16} cy={16} r={9} fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} opacity={0.35} />
        <Seal />
      </>
    ),
  },
  {
    id: "involved",
    label: "Betrokken",
    hint: "Onderdeel van het team",
    render: () => (
      <>
        <circle
          cx={16}
          cy={16}
          r={9}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth={1.5}
          opacity={0.5}
          strokeDasharray="3,4"
        />
        <Seal />
      </>
    ),
  },
];

/**
 * A compact, Dutch legend explaining the live-run node states. Only mounted
 * while a run is active (controlled by the parent). The card captures pointer
 * events but the surrounding wrapper does not, so it never blocks panning the
 * map. Entrance motion is skipped under prefers-reduced-motion.
 */
export default function RunLegend() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="pointer-events-none w-64"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      data-testid="run-legend"
    >
      <div className="pointer-events-auto bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-foreground px-4 py-2.5">
          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Tijdens een run
          </span>
          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-accent">
            Live
          </span>
        </div>
        <ul className="flex flex-col gap-2.5 px-4 py-3.5">
          {SWATCHES.map((s) => (
            <li key={s.id} className="flex items-center gap-3" data-testid={`run-legend-${s.id}`}>
              <svg width={32} height={32} className="shrink-0 overflow-visible" aria-hidden="true">
                {s.render(!!reduce)}
              </svg>
              <div className="flex flex-col leading-tight">
                <span className="font-['Inter'] text-sm font-semibold text-foreground">
                  {s.label}
                </span>
                <span className="font-['Inter'] text-[11px] text-muted-foreground">
                  {s.hint}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
