/**
 * The generation engine: the single source of truth for running a team of
 * agents over a client + workflow, producing the deliverable, and archiving the
 * run with a faithful per-agent audit trail. Both the interactive SSE route and
 * the autonomous (n8n/scheduler-triggered) route call into this, so the
 * archival + step->run status rules live in exactly one place.
 *
 * This module is the stable public facade: it re-exports the engine surface from
 * the focused units it was split into — `generation-text` (pure text reducers &
 * side-channel parsers), `generation-routing` (request validation + plan/fanout
 * parsing), `generation-types` (shared types), and `generation-orchestrator`
 * (the run lifecycle: stage loop, agent runner, deliverables, archival,
 * approval gating). Consumers keep importing everything from "./generate-engine".
 */

export {
  extractHandoffBrief,
  resolveBriefGateFlags,
  stripHumanizerMeta,
  toClientFacingReport,
} from "./generation-text";

export {
  resolveGenerationContext,
  parseStages,
  parseFanout,
  MAX_FANOUT,
  QC_REVIEWER_PATH,
  QC_HUMANIZER_PATH,
} from "./generation-routing";

export { runGeneration } from "./generation-orchestrator";

export type {
  GenerationContext,
  EmailReplyContext,
  GenerationResult,
  ResolveResult,
  GenerationSink,
} from "./generation-types";
