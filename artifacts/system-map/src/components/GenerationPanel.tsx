import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2,
  Copy,
  Download,
  Check,
  Square,
  Play,
  RotateCcw,
  X,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GenerationController } from "@/hooks/useGeneration";

const selectTriggerClass =
  "h-10 rounded-none border-foreground bg-card font-['Inter'] text-sm focus:ring-0 focus:ring-offset-0 focus:border-accent shadow-none";
const selectContentClass =
  "rounded-none border-foreground bg-card text-foreground shadow-[4px_4px_0px_hsl(var(--foreground))]";
const selectItemClass =
  "rounded-none font-['Inter'] focus:bg-foreground focus:text-background";

/**
 * The one-shot generation flow surfaced as an expanding panel anchored above the
 * Kaart command bar: routing review (editable lead/team), smart intake, the
 * streamed per-agent team output, the deliverable, copy/download and the archive
 * confirmation. Only mounted while a request is active.
 */
export default function GenerationPanel({
  gen,
}: {
  gen: GenerationController;
}) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const {
    request,
    routing,
    routeError,
    result,
    isRouted,
    workflows,
    workflowPath,
    setWorkflowPath,
    agentPath,
    setAgentPath,
    recommendedAgents,
    otherAgents,
    teamPaths,
    titleFor,
    removeMember,
    segments,
    isStreaming,
    streamError,
    canGenerate,
    handleGenerate,
    handleStop,
    handleRoute,
    combinedOutput,
    copied,
    handleCopy,
    handleDownload,
    justSaved,
    elapsedLabel,
    activeStep,
    intakeFields,
    intakeAnswers,
    setIntakeAnswers,
    intakeLoading,
    deliverable,
    deliverableContent,
    deliverableStatus,
    deliverableError,
    deliverableTruncated,
    deliverableCopied,
    handleDeliverableCopy,
    handleDeliverableDownload,
    resetFlow,
  } = gen;

  const hasOutput = segments.length > 0 || isStreaming || !!streamError;

  return (
    <motion.div
      className="pointer-events-auto w-[min(46rem,calc(100vw-3rem))]"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      data-testid="generation-panel"
    >
      <div className="flex max-h-[min(70vh,40rem)] flex-col border border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-foreground px-4 py-2.5">
          <span className="flex items-center gap-2 font-['Space_Mono'] text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            <Loader2
              className={`w-3.5 h-3.5 ${
                isStreaming || routing
                  ? "animate-spin text-accent"
                  : "text-muted-foreground"
              }`}
            />
            {routing
              ? "Taak herkennen"
              : isStreaming
                ? "Aan het drukken"
                : combinedOutput
                  ? "Voltooid"
                  : "Redactiebureau"}
          </span>
          <div className="flex items-center gap-3">
            {segments.length > 0 && (
              <span
                className="flex items-center gap-3 font-['Space_Mono'] text-[10px] text-muted-foreground"
                data-testid="text-progress"
              >
                <span>
                  Stap {activeStep}/{segments.length}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="w-3 h-3" />
                  {elapsedLabel}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Paneel uitklappen" : "Paneel inklappen"}
              aria-expanded={!collapsed}
              title={collapsed ? "Uitklappen" : "Inklappen"}
              data-testid="button-collapse"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {collapsed ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={resetFlow}
              aria-label="Sluiten"
              title="Sluiten en wissen"
              data-testid="button-reset"
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible body + footer */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="panel-body"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto px-5 py-5"
          data-lenis-prevent
          onWheelCapture={(e) => e.stopPropagation()}
        >
          {routeError && (
            <div className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive font-['Inter']">
              {routeError}
            </div>
          )}

          {result?.needsClarification && (
            <div
              className="border-l-2 border-accent bg-accent/5 px-3 py-2 text-sm font-['Inter']"
              data-testid="text-clarification"
            >
              <span className="mb-1 block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent">
                Even verduidelijken
              </span>
              {result.clarification}
            </div>
          )}

          {/* Routing review */}
          {isRouted && (
            <section className="space-y-4" data-testid="routing-review">
              <div className="flex items-start gap-3">
                {result?.taskType && (
                  <span className="shrink-0 bg-foreground px-2 py-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-background">
                    {result.taskType}
                  </span>
                )}
                {result?.reasoning && (
                  <p
                    className="font-['Inter'] text-sm leading-snug"
                    data-testid="text-reasoning"
                  >
                    {result.reasoning}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                    Workflow
                  </label>
                  <Select
                    value={workflowPath}
                    onValueChange={(v) => {
                      setWorkflowPath(v);
                      setAgentPath("");
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-workflow"
                      className={selectTriggerClass}
                    >
                      <SelectValue placeholder="Geen workflow" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      {workflows.map((w) => (
                        <SelectItem
                          key={w.path}
                          value={w.path}
                          className={selectItemClass}
                        >
                          {w.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                    Lead / Agent
                  </label>
                  <Select value={agentPath} onValueChange={setAgentPath}>
                    <SelectTrigger
                      data-testid="select-agent"
                      className={selectTriggerClass}
                    >
                      <SelectValue placeholder="Kies lead" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      {recommendedAgents.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                            Aanbevolen
                          </SelectLabel>
                          {recommendedAgents.map((a) => (
                            <SelectItem
                              key={a.path}
                              value={a.path}
                              className={selectItemClass}
                            >
                              {a.title}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      <SelectGroup>
                        {recommendedAgents.length > 0 && (
                          <SelectLabel className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                            Overige agents
                          </SelectLabel>
                        )}
                        {otherAgents.map((a) => (
                          <SelectItem
                            key={a.path}
                            value={a.path}
                            className={selectItemClass}
                          >
                            {a.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Team composition */}
              <div className="space-y-2" data-testid="text-additional-agents">
                <label className="flex items-center justify-between font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>Mogelijk ook betrokken</span>
                  <span>
                    {teamPaths.length}{" "}
                    {teamPaths.length === 1 ? "redacteur" : "redacteurs"}
                  </span>
                </label>
                {teamPaths.map((p, i) => {
                  const seg = segments.find((s) => s.path === p);
                  const isLead = i === 0;
                  const note =
                    seg?.status === "working"
                      ? "Bezig..."
                      : seg?.status === "done"
                        ? "Klaar"
                        : seg?.status === "queued"
                          ? "In wachtrij"
                          : null;
                  return (
                    <div
                      key={p}
                      data-testid={`team-member-${i}`}
                      className={`flex items-center gap-3 border-l-2 p-2 text-sm ${
                        isLead
                          ? "border-accent bg-accent/5"
                          : "border-foreground bg-secondary/40"
                      }`}
                    >
                      <span
                        className={`shrink-0 font-['Space_Mono'] text-xs ${
                          isLead ? "text-accent" : "text-muted-foreground"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`truncate font-medium ${
                          isLead ? "text-accent" : ""
                        }`}
                      >
                        {titleFor(p)}
                      </span>
                      {note ? (
                        <span
                          className={`ml-auto shrink-0 text-xs italic ${
                            seg?.status === "working"
                              ? "text-accent"
                              : "text-muted-foreground"
                          }`}
                        >
                          {note}
                        </span>
                      ) : isLead ? (
                        <span className="ml-auto shrink-0 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent">
                          Hoofd
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeMember(p)}
                          disabled={isStreaming}
                          className="ml-auto shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                          aria-label={`Verwijder ${titleFor(p)}`}
                          data-testid={`button-remove-member-${i}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleRoute}
                disabled={routing || isStreaming}
                className="inline-flex items-center gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                data-testid="button-reroute"
              >
                <RotateCcw className="w-3 h-3" />
                Opnieuw herkennen
              </button>
            </section>
          )}

          {/* Smart intake */}
          {isRouted && (intakeLoading || intakeFields.length > 0) && (
            <section
              className="mt-5 border-t border-foreground/20 pt-5"
              data-testid="intake-block"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Aanvullende info
                </h3>
                {intakeLoading && (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                )}
              </div>
              {intakeFields.length > 0 && (
                <div className="space-y-4">
                  <p className="font-['Inter'] text-xs leading-snug text-muted-foreground">
                    Vul aan wat je weet. Leeg laten mag — dan markeert de
                    specialist het als{" "}
                    <span className="font-['Space_Mono'] text-foreground">
                      [AAN TE VULLEN]
                    </span>
                    .
                  </p>
                  {intakeFields.map((f) => (
                    <div key={f.key}>
                      <label
                        htmlFor={`intake-${f.key}`}
                        className="mb-1 block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground"
                      >
                        {f.label}
                      </label>
                      <input
                        id={`intake-${f.key}`}
                        type="text"
                        value={intakeAnswers[f.key] ?? ""}
                        onChange={(e) =>
                          setIntakeAnswers((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                        placeholder={f.example ? `bv. ${f.example}` : ""}
                        disabled={isStreaming}
                        data-testid={`input-intake-${f.key}`}
                        className="w-full border-b border-foreground bg-transparent pb-1 font-['Inter'] text-sm placeholder:text-muted-foreground focus:border-accent focus:outline-none disabled:opacity-50"
                      />
                      {f.hint && (
                        <span className="mt-1 block font-['Inter'] text-[11px] text-muted-foreground">
                          {f.hint}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Streamed output */}
          {hasOutput && (
            <section className="mt-5 border-t border-foreground/20 pt-5">
              {streamError && (
                <div className="mb-5 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive font-['Inter']">
                  {streamError}
                </div>
              )}

              {combinedOutput && !isStreaming && (
                <div className="mb-4 flex items-center gap-3">
                  {justSaved && (
                    <Link
                      href="/history"
                      data-testid="link-saved-archive"
                      className="flex items-center gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-green-700 transition-colors hover:text-accent"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Bewaard in archief
                    </Link>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="Kopiëren"
                      aria-label="Kopiëren"
                      data-testid="button-copy"
                      className="group p-2 text-foreground transition-colors hover:bg-background"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 group-hover:text-accent" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      title="Downloaden"
                      aria-label="Downloaden"
                      data-testid="button-download"
                      className="group p-2 text-foreground transition-colors hover:bg-background"
                    >
                      <Download className="w-4 h-4 group-hover:text-accent" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-8">
                {segments.map((seg, i) => {
                  const prevTitle = i > 0 ? segments[i - 1].title : "de redactie";
                  const isDone = seg.status === "done";
                  const isWorking = seg.status === "working";
                  const isQueued = seg.status === "queued";
                  return (
                    <div
                      key={`${seg.path}-${i}`}
                      data-testid={`segment-${i}`}
                      className={
                        isDone
                          ? "opacity-70 transition-opacity hover:opacity-100"
                          : isQueued
                            ? "opacity-40"
                            : ""
                      }
                    >
                      <div
                        className={`mb-3 flex items-center gap-3 border-b pb-2 ${
                          isWorking ? "border-foreground" : "border-foreground/10"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isDone
                              ? "bg-green-600"
                              : isWorking
                                ? "bg-accent animate-pulse"
                                : "bg-foreground/30"
                          }`}
                        />
                        <h3
                          className={`font-['Space_Mono'] text-xs font-bold uppercase tracking-widest ${
                            isWorking ? "text-accent" : ""
                          }`}
                        >
                          {seg.title}
                        </h3>
                        {seg.role === "lead" && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                            Hoofd
                          </span>
                        )}
                        <span
                          className={`ml-auto shrink-0 text-xs italic ${
                            isWorking ? "text-accent/70" : "text-muted-foreground"
                          }`}
                        >
                          {isDone
                            ? "Klaar"
                            : isWorking
                              ? "Aan het schrijven..."
                              : "In wachtrij..."}
                        </span>
                      </div>

                      {isQueued && !seg.content ? (
                        <div className="flex h-16 items-center justify-center border border-dashed border-foreground/20 bg-background/50">
                          <span className="font-['Space_Mono'] text-xs uppercase tracking-widest text-muted-foreground">
                            Wachten op {prevTitle}...
                          </span>
                        </div>
                      ) : (
                        <article className="prose prose-sm max-w-none font-['Inter'] prose-headings:font-['Playfair_Display'] prose-headings:font-bold prose-headings:tracking-tight prose-strong:text-foreground prose-a:text-accent">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {seg.content}
                          </ReactMarkdown>
                          {isWorking && (
                            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-accent align-middle" />
                          )}
                        </article>
                      )}
                      {seg.truncated && (
                        <p
                          className="mt-3 flex items-start gap-2 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 font-['Inter'] text-xs text-amber-700"
                          data-testid={`segment-truncated-${i}`}
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Deze sectie raakte de lengtelimiet en is mogelijk
                            afgekapt. Druk opnieuw of splits de taak op voor een
                            volledige versie.
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Deliverable */}
              {deliverable && (
                <div className="mt-8" data-testid="deliverable-panel">
                  <div className="mb-3 flex items-center gap-3 border-b-2 border-accent pb-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        deliverableStatus === "working"
                          ? "bg-accent animate-pulse"
                          : deliverableStatus === "error"
                            ? "bg-destructive"
                            : "bg-green-600"
                      }`}
                    />
                    <h3 className="font-['Space_Mono'] text-xs font-bold uppercase tracking-widest text-accent">
                      Eindproduct — {deliverable.title}
                    </h3>
                    <span className="ml-auto shrink-0 text-xs italic text-muted-foreground">
                      {deliverableStatus === "working"
                        ? "Aan het samenstellen..."
                        : deliverableStatus === "error"
                          ? "Mislukt"
                          : "Klaar"}
                    </span>
                  </div>

                  <p className="mb-3 font-['Inter'] text-xs text-muted-foreground">
                    {deliverable.note}
                  </p>

                  {deliverableStatus === "error" ? (
                    <div className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive font-['Inter']">
                      Het eindproduct kon niet worden samengesteld
                      {deliverableError ? `: ${deliverableError}` : "."} De
                      teamtekst hierboven blijft bruikbaar.
                    </div>
                  ) : (
                    <>
                      {deliverableStatus === "done" && (
                        <div className="mb-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleDeliverableCopy}
                            data-testid="button-deliverable-copy"
                            className="inline-flex items-center gap-1.5 px-2 py-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent"
                          >
                            {deliverableCopied ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            Kopiëren
                          </button>
                          <button
                            type="button"
                            onClick={handleDeliverableDownload}
                            data-testid="button-deliverable-download"
                            className="inline-flex items-center gap-1.5 px-2 py-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {deliverable.filename}
                          </button>
                        </div>
                      )}
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-foreground bg-foreground p-4 font-['Space_Mono'] text-xs leading-relaxed text-background shadow-[4px_4px_0px_hsl(var(--foreground))]">
                        {deliverableContent}
                        {deliverableStatus === "working" && (
                          <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-background/80 align-middle" />
                        )}
                      </pre>
                      {deliverableTruncated && (
                        <p className="mt-3 flex items-start gap-2 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 font-['Inter'] text-xs text-amber-700">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Het eindproduct raakte de lengtelimiet en is mogelijk
                            afgekapt.
                          </span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer action */}
        {isRouted && (
          <div className="border-t border-foreground bg-card px-4 py-3">
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                data-testid="button-stop"
                className="flex w-full items-center justify-center gap-2.5 border-2 border-accent bg-accent py-3 font-['Space_Mono'] text-sm font-bold uppercase tracking-widest text-accent-foreground shadow-[4px_4px_0px_hsl(var(--foreground))] transition-all active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop persen
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                data-testid="button-generate"
                className="flex w-full items-center justify-center gap-2.5 border-2 border-foreground bg-foreground py-3 font-['Space_Mono'] text-sm font-bold uppercase tracking-widest text-background shadow-[4px_4px_0px_hsl(var(--foreground))] transition-all hover:border-accent hover:bg-accent hover:text-accent-foreground active:translate-x-1 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-40"
              >
                <Play className="w-4 h-4 fill-current" />
                {combinedOutput ? "Opnieuw drukken" : "Drukken"}
              </button>
            )}
          </div>
        )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
