import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Radio,
} from "lucide-react";
import type { HandoffBrief } from "@workspace/api-client-react";

/** A small flag chip used both run-wide (header) and per agent (in a brief). */
export function FlagChip({
  label,
  value,
  Icon,
}: {
  label: string;
  value: boolean | null;
  Icon: typeof Eye;
}) {
  if (value === null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${
        value
          ? "border-accent text-accent"
          : "border-foreground/30 text-muted-foreground"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

/** One agent's internal handoff brief, shown as a collapsible per-agent panel. */
export function HandoffBriefPanel({
  brief,
}: {
  brief: NonNullable<HandoffBrief>;
}) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const sections: { label: string; items: string[] }[] = [
    { label: "Beslissingen", items: brief.decisions },
    { label: "Vast te houden feiten", items: brief.keyFacts },
    { label: "Open vragen", items: brief.openQuestions },
  ];
  return (
    <div className="mt-2 border border-foreground/20 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-toggle-handoff"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-foreground/5 transition-colors"
      >
        <Chevron className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Interne overdracht
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <FlagChip
            label="Klantgericht"
            value={brief.clientFacing}
            Icon={brief.clientFacing ? Eye : EyeOff}
          />
          <FlagChip
            label="Live account"
            value={brief.touchesLiveAccount}
            Icon={Radio}
          />
        </span>
      </button>
      {open && (
        <div
          className="px-3 pb-3 pt-1 flex flex-col gap-3"
          data-testid="handoff-content"
        >
          {sections.map(
            (s) =>
              s.items.length > 0 && (
                <div key={s.label}>
                  <p className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                    {s.label}
                  </p>
                  <ul className="list-disc pl-4 flex flex-col gap-0.5">
                    {s.items.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-foreground font-['Inter']"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {brief.forNext && (
            <div>
              <p className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                Voor het volgende teamlid
              </p>
              <p className="text-xs text-foreground font-['Inter'] italic">
                {brief.forNext}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
