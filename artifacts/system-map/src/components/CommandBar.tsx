import { useRef, useEffect } from "react";
import { Loader2, ArrowUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GenerationController } from "@/hooks/useGeneration";

const selectTriggerClass =
  "h-10 w-[7.5rem] sm:w-[11rem] shrink-0 rounded-none border-0 border-r border-foreground bg-transparent font-['Space_Mono'] text-[11px] uppercase tracking-widest focus:ring-0 focus:ring-offset-0 shadow-none";
const selectContentClass =
  "rounded-none border-foreground bg-card text-foreground shadow-[4px_4px_0px_hsl(var(--foreground))]";
const selectItemClass =
  "rounded-none font-['Inter'] focus:bg-foreground focus:text-background";

// The client picker is optional: an opdracht can run without a client (internal/
// agency-general work). Radix Select forbids an empty-string item value, so we
// represent "no client" with a sentinel and map it to/from the empty clientPath.
const NO_CLIENT = "__none__";

/**
 * ChatGPT-style command bar docked at the bottom-center of the Kaart: a client
 * picker, a prompt input, and a send button. Submitting runs the Orchestrator
 * routing; the rest of the one-shot flow surfaces in the GenerationPanel above.
 */
export default function CommandBar({ gen }: { gen: GenerationController }) {
  const {
    clients,
    clientPath,
    setClientPath,
    request,
    setRequest,
    routing,
    isStreaming,
    canRoute,
    handleRoute,
    hasActiveFlow,
    resetFlow,
  } = gen;

  // While a task is in flight (routing or the team is streaming) the command bar
  // locks: the client picker, prompt and send button are disabled so a stray
  // click or keystroke can't silently discard a running task. The "Stop persen"
  // button in the GenerationPanel above is the deliberate way to interrupt.
  const isRunning = routing || isStreaming;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea with its content, capped so the bar stays compact.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [request]);

  const onSend = () => {
    if (!canRoute) return;
    handleRoute();
  };

  return (
    <div className="pointer-events-auto w-[min(46rem,calc(100vw-3rem))]">
      <div className="flex items-end bg-card border border-foreground shadow-[4px_4px_0px_hsl(var(--foreground))]">
        <div className="self-stretch flex items-center">
          <Select
            value={clientPath || NO_CLIENT}
            disabled={isRunning}
            onValueChange={(v) => {
              setClientPath(v === NO_CLIENT ? "" : v);
              if (hasActiveFlow) resetFlow();
            }}
          >
            <SelectTrigger
              data-testid="select-client"
              title={
                isRunning
                  ? "Stop de lopende taak om van klant te wisselen"
                  : undefined
              }
              className={`${selectTriggerClass} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <SelectValue placeholder="Kies klant" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              <SelectItem value={NO_CLIENT} className={selectItemClass}>
                Geen klant
              </SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.path} value={c.path} className={selectItemClass}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <textarea
          ref={textareaRef}
          value={request}
          disabled={isRunning}
          onChange={(e) => {
            setRequest(e.target.value);
            if (hasActiveFlow) resetFlow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={
            isRunning
              ? "Taak loopt — stop ze om een nieuwe te starten..."
              : "Beschrijf de opdracht en druk op Enter..."
          }
          data-testid="input-request"
          className="flex-1 resize-none bg-transparent px-4 py-3 font-['Inter'] text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none max-h-[120px] disabled:cursor-not-allowed"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canRoute || isRunning}
          aria-label="Versturen"
          title="Versturen"
          data-testid="button-route"
          className="m-2 flex h-9 w-9 shrink-0 items-center justify-center bg-foreground text-background transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:pointer-events-none"
        >
          {routing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
