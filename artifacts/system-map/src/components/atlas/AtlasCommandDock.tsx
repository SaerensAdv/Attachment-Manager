import { AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Radio, Square } from "lucide-react";
import CommandBar from "@/components/CommandBar";
import GenerationPanel from "@/components/GenerationPanel";
import { useAtlasGeneration } from "./AtlasGenerationProvider";
import "./AtlasCommandDock.css";

const excludedRoutes = new Set(["/legacy", "/visuals"]);

export default function AtlasCommandDock() {
  const [location, navigate] = useLocation();
  const generation = useAtlasGeneration();
  if (excludedRoutes.has(location)) return null;

  const active = generation.segments.find((segment) => segment.status === "working");
  const hasError = Boolean(generation.routeError || generation.streamError);
  const completed = generation.runCompleted && !hasError;

  return <div className={`atlas-command-dock${generation.hasActiveFlow ? " has-flow" : ""}`}>
    <AnimatePresence>
      {generation.hasActiveFlow && <div className="atlas-generation-layer" key="atlas-generation-panel"><GenerationPanel gen={generation} /></div>}
    </AnimatePresence>
    <div className="atlas-command-status" aria-live="polite">
      {generation.routing && <span><Loader2 className="atlas-rotating" />Orchestrator is routing</span>}
      {generation.isStreaming && <span><Radio />{active ? `${active.title} is working` : "Team is working"} · {generation.elapsedLabel}</span>}
      {hasError && <span className="is-error"><AlertTriangle />Run interrupted, prompt preserved</span>}
      {completed && <button type="button" onClick={() => generation.pendingGenerationId && navigate(`/history?id=${generation.pendingGenerationId}`)} disabled={!generation.pendingGenerationId}><CheckCircle2 />Run complete{generation.pendingGenerationId ? " · Open run" : ""}{generation.pendingGenerationId && <ExternalLink />}</button>}
      {generation.isStreaming && <button type="button" className="atlas-stop-run" onClick={generation.handleStop}><Square />Stop</button>}
    </div>
    <CommandBar gen={generation} />
  </div>;
}
