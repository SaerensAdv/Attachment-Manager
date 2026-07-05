import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger";
import {
  VISUAL_FORMATS,
  buildVisualPlanPrompt,
  parseVisualPlanJson,
  type VisualFormat,
} from "../lib/visual-plan";

const router: IRouter = Router();

const MAX_SOURCE_CHARS = 12_000;

router.post("/visuals/plan", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sourceText =
    typeof body.sourceText === "string" ? body.sourceText.trim() : "";
  if (!sourceText) {
    res.status(400).json({ error: "sourceText is verplicht." });
    return;
  }
  const forced: VisualFormat | null = VISUAL_FORMATS.includes(
    body.format as VisualFormat,
  )
    ? (body.format as VisualFormat)
    : null;

  const system = buildVisualPlanPrompt(forced);
  let lastError: unknown = null;
  // One retry: a single malformed-JSON response shouldn't cost the user a click.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system,
        messages: [
          { role: "user", content: sourceText.slice(0, MAX_SOURCE_CHARS) },
        ],
      });
      const raw = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      res.json(parseVisualPlanJson(raw, forced));
      return;
    } catch (err) {
      lastError = err;
      logger.warn(
        { scope: "visuals:plan", attempt, err: String(err) },
        "Visualplan-poging mislukt",
      );
    }
  }
  res.status(502).json({
    error: "Kon geen visualplan maken. Probeer het opnieuw.",
    detail: lastError instanceof Error ? lastError.message : String(lastError),
  });
});

/**
 * House-style guardrails appended server-side so a hand-edited prompt can
 * never accidentally ask for text in the pixels — copy is always real HTML
 * drawn on top by the studio templates.
 */
const IMAGE_GUARDRAILS =
  "Strictly no text, letters, numbers, words, logos or watermarks anywhere in the image. " +
  "Dark, muted, atmospheric backdrop with generous negative space, suitable behind white overlay text. " +
  "Subtle deep purple and amber accents on a near-black base.";

router.post("/visuals/background", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    res.status(400).json({ error: "prompt is verplicht." });
    return;
  }

  const base = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "").trim();
  const key = (process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "").trim();
  if (!base || !key) {
    res.status(503).json({
      error:
        "AI-achtergronden zijn niet geconfigureerd (OpenAI-integratie ontbreekt).",
    });
    return;
  }

  try {
    // Lazy import: the OpenAI image client asserts its env vars at module
    // scope, so a static import would crash the whole server at boot when the
    // integration is absent — this route must degrade to the 503 above instead.
    const { generateImageBuffer } = await import(
      "@workspace/integrations-openai-ai-server/image"
    );
    // Portrait is the closest gpt-image-1 size to the 4:5 artboards; the
    // template crops with object-fit: cover.
    const buffer = await generateImageBuffer(
      `${prompt.slice(0, 2_000)}\n\n${IMAGE_GUARDRAILS}`,
      "1024x1536",
    );
    res.json({
      imageDataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
    });
  } catch (err) {
    logger.warn(
      { scope: "visuals:background", err: String(err) },
      "AI-achtergrond genereren mislukt",
    );
    res.status(502).json({
      error: "De achtergrond kon niet gegenereerd worden. Probeer het opnieuw.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
