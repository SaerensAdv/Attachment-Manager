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
  "h-10 w-[11rem] rounded-none border-0 border-r border-foreground bg-transparent font-['Space_Mono'] text-[11px] uppercase tracking-widest focus:ring-0 focus:ring-offset-0 shadow-none";
const selectContentClass =
  "rounded-none border-foreground bg-card text-foreground shadow-[4px_4px_0px_hsl(var(--foreground))]";
const selectItemClass =
  "rounded-none font-['Inter'] focus:bg-foreground focus:text-background";

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
    canRoute,
    handleRoute,
    hasActiveFlow,
    resetFlow,
  } = gen;

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
            value={clientPath}
            onValueChange={(v) => {
              setClientPath(v);
              if (hasActiveFlow) resetFlow();
            }}
          >
            <SelectTrigger data-testid="select-client" className={selectTriggerClass}>
              <SelectValue placeholder="Kies klant" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
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
          placeholder="Beschrijf de opdracht en druk op Enter..."
          data-testid="input-request"
          className="flex-1 resize-none bg-transparent px-4 py-3 font-['Inter'] text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none max-h-[120px]"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canRoute}
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
