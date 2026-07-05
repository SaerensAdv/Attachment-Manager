import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileImage,
  FileText,
  Loader2,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  usePlanVisual,
  useGenerateVisualBackground,
  type VisualPlanResult,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import Reveal from "@/components/Reveal";
import { VisualCanvas } from "@/components/visuals/VisualCanvas";
import {
  CANVAS_SIZES,
  FORMAT_LABELS,
  VISUAL_SOURCE_KEY,
  defaultContent,
  emptySlide,
  type SlideContent,
  type StudioContent,
  type VisualFormat,
} from "@/lib/visuals";
import { downloadDataUrl, nodeToPng, slidesToPdf } from "@/lib/visual-export";

const FORMATS: VisualFormat[] = ["carousel", "single", "quote"];

const inputCls =
  "w-full bg-background border border-foreground/25 px-3 py-2 font-['Inter'] text-sm focus:outline-none focus:border-foreground";
const labelCls =
  "block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1";

export default function VisualStudio() {
  const { toast } = useToast();
  const [content, setContent] = useState<StudioContent>(defaultContent);
  const [activeSlide, setActiveSlide] = useState(0);
  const [exporting, setExporting] = useState<null | "png" | "pngs" | "pdf">(
    null,
  );
  // Hand-off from the archive: "Maak visual" stores the chosen post concept.
  // Read it in the state initializer (synchronous and remount-safe — the page
  // transition can mount this component more than once); only clear the key
  // after a grace period so a quick remount can still re-read it.
  const [sourceText, setSourceText] = useState(
    () => sessionStorage.getItem(VISUAL_SOURCE_KEY) ?? "",
  );
  useEffect(() => {
    const t = window.setTimeout(
      () => sessionStorage.removeItem(VISUAL_SOURCE_KEY),
      1500,
    );
    return () => window.clearTimeout(t);
  }, []);
  const planMutation = usePlanVisual();
  const backgroundMutation = useGenerateVisualBackground();

  const { format } = content;
  const { w, h } = CANVAS_SIZES[format];
  const slideCount = content.slides.length;

  useEffect(() => {
    if (activeSlide > slideCount - 1) setActiveSlide(Math.max(0, slideCount - 1));
  }, [activeSlide, slideCount]);

  // Preview scale: fit the 1080px artboard to the available column width.
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useLayoutEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const update = () =>
      setScale(Math.min(1, (el.clientWidth || w) / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  // Offscreen export stage: identical DOM at full size, one node per page.
  const exportRefs = useRef<(HTMLDivElement | null)[]>([]);
  const exportPages = format === "carousel" ? slideCount : 1;

  const patch = useCallback((p: Partial<StudioContent>) => {
    setContent((c) => ({ ...c, ...p }));
  }, []);

  const applyPlan = useCallback((plan: VisualPlanResult) => {
    setContent((c) => ({
      ...c,
      format: FORMATS.includes(plan.format as VisualFormat)
        ? (plan.format as VisualFormat)
        : c.format,
      slides:
        plan.slides.length > 0
          ? plan.slides.map((s) => ({
              kicker: s.kicker,
              title: s.title,
              body: s.body,
            }))
          : c.slides,
      single: plan.single.headline ? plan.single : c.single,
      quote: plan.quote.quote ? plan.quote : c.quote,
      imagePrompt: plan.imagePrompt || c.imagePrompt,
    }));
    setActiveSlide(0);
  }, []);

  const suggestContent = useCallback(() => {
    const text = sourceText.trim();
    if (!text) {
      toast({
        title: "Plak eerst een postconcept",
        description: "Kopieer de tekst van je LinkedIn-post in het veld.",
        variant: "destructive",
      });
      return;
    }
    planMutation.mutate(
      { data: { sourceText: text } },
      {
        onSuccess: (plan) => {
          applyPlan(plan);
          toast({
            title: "Content voorgesteld",
            description:
              plan.notes ||
              `Aanbevolen formaat: ${FORMAT_LABELS[plan.format as VisualFormat] ?? plan.format}. Alles blijft bewerkbaar.`,
          });
        },
        onError: (e) => {
          toast({
            title: "Voorstel mislukt",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          });
        },
      },
    );
  }, [sourceText, planMutation, applyPlan, toast]);

  const generateBackground = useCallback(() => {
    const prompt = content.imagePrompt.trim();
    if (!prompt) {
      toast({
        title: "Geen prompt",
        description:
          "Beschrijf eerst (in het Engels) welke achtergrond je wil.",
        variant: "destructive",
      });
      return;
    }
    backgroundMutation.mutate(
      { data: { prompt } },
      {
        onSuccess: (res) => {
          patch({ backgroundImage: res.imageDataUrl });
          toast({
            title: "Achtergrond klaar",
            description: "De AI-achtergrond staat achter je tekst.",
          });
        },
        onError: (e) => {
          toast({
            title: "Achtergrond mislukt",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          });
        },
      },
    );
  }, [content.imagePrompt, backgroundMutation, patch, toast]);

  const patchSlide = useCallback((i: number, p: Partial<SlideContent>) => {
    setContent((c) => ({
      ...c,
      slides: c.slides.map((s, j) => (j === i ? { ...s, ...p } : s)),
    }));
  }, []);

  const moveSlide = useCallback((i: number, dir: -1 | 1) => {
    setContent((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.slides.length) return c;
      const slides = [...c.slides];
      const [s] = slides.splice(i, 1);
      slides.splice(j, 0, s);
      return { ...c, slides };
    });
    setActiveSlide((a) => (a === i ? i + dir : a));
  }, []);

  const removeSlide = useCallback((i: number) => {
    setContent((c) =>
      c.slides.length <= 1
        ? c
        : { ...c, slides: c.slides.filter((_, j) => j !== i) },
    );
  }, []);

  const capturePages = useCallback(async (): Promise<string[]> => {
    const nodes = exportRefs.current.slice(0, exportPages);
    const pngs: string[] = [];
    for (const node of nodes) {
      if (!node) throw new Error("Exportcanvas niet gevonden");
      pngs.push(await nodeToPng(node, w, h));
    }
    return pngs;
  }, [exportPages, w, h]);

  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportPng = useCallback(async () => {
    setExporting("png");
    try {
      const idx = format === "carousel" ? activeSlide : 0;
      const node = exportRefs.current[idx];
      if (!node) throw new Error("Exportcanvas niet gevonden");
      const png = await nodeToPng(node, w, h);
      const suffix = format === "carousel" ? `-slide-${idx + 1}` : "";
      const naam = format === "carousel" ? "carrousel" : format;
      downloadDataUrl(png, `saerens-${naam}${suffix}-${stamp()}.png`);
    } catch (e) {
      toast({
        title: "Export mislukt",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }, [format, activeSlide, w, h, toast]);

  const exportAllPngs = useCallback(async () => {
    setExporting("pngs");
    try {
      const pngs = await capturePages();
      pngs.forEach((png, i) =>
        downloadDataUrl(png, `saerens-carrousel-slide-${i + 1}-${stamp()}.png`),
      );
    } catch (e) {
      toast({
        title: "Export mislukt",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }, [capturePages, toast]);

  const exportPdf = useCallback(async () => {
    setExporting("pdf");
    try {
      const pngs = await capturePages();
      slidesToPdf(pngs, w, h, `saerens-carrousel-${stamp()}.pdf`);
    } catch (e) {
      toast({
        title: "Export mislukt",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }, [capturePages, w, h, toast]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16">
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-8">
            <p className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
              Studio
            </p>
            <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl tracking-tight">
              Visual Studio
            </h1>
            <p className="font-['Inter'] text-sm text-muted-foreground mt-4 max-w-2xl">
              Maak branded LinkedIn-visuals in de Saerens-huisstijl: carrousels
              (documentposts), losse afbeeldingen en quote-cards. Alles blijft
              bewerkbaar; download als PNG of PDF.
            </p>
          </header>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 items-start">
          {/* ── Left: content controls ───────────────────────────── */}
          <div className="space-y-6">
            {/* AI: post concept → content plan */}
            <section className="border border-foreground/20 p-4 space-y-3">
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                Van postconcept naar visual
              </p>
              <textarea
                className={`${inputCls} resize-y`}
                rows={4}
                placeholder="Plak hier de tekst van je LinkedIn-postconcept…"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                data-testid="source-text"
              />
              <button
                type="button"
                onClick={suggestContent}
                disabled={planMutation.isPending}
                data-testid="suggest-content"
                className="flex items-center gap-2 px-3 py-2 bg-foreground text-background font-['Space_Mono'] text-[11px] uppercase tracking-widest disabled:opacity-50"
              >
                {planMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Stel content voor
              </button>
              <p className="font-['Inter'] text-xs text-muted-foreground">
                De AI vult alle drie de formaten in op basis van je post; jij
                kiest en bewerkt daarna.
              </p>
            </section>

            {/* Format + theme */}
            <section className="border border-foreground/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => patch({ format: f })}
                    data-testid={`format-${f}`}
                    className={`px-3 py-2 font-['Space_Mono'] text-[11px] uppercase tracking-widest border transition-colors ${
                      format === f
                        ? "bg-foreground text-background border-foreground"
                        : "border-foreground/25 text-foreground/60 hover:text-foreground"
                    }`}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patch({ theme: content.theme === "dark" ? "light" : "dark" })
                  }
                  data-testid="toggle-theme"
                  title={
                    content.theme === "dark"
                      ? "Wissel naar licht"
                      : "Wissel naar donker"
                  }
                  className="ml-auto p-2 border border-foreground/25 text-foreground/60 hover:text-foreground"
                >
                  {content.theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </section>

            {/* Content fields */}
            {format === "carousel" && (
              <section className="space-y-3">
                {content.slides.map((s, i) => (
                  <div
                    key={i}
                    className={`border p-4 space-y-3 cursor-pointer transition-colors ${
                      i === activeSlide
                        ? "border-foreground"
                        : "border-foreground/20 hover:border-foreground/40"
                    }`}
                    onClick={() => setActiveSlide(i)}
                    data-testid={`slide-card-${i}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                        Slide {i + 1} / {slideCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          className="p-1 text-foreground/40 hover:text-foreground disabled:opacity-30"
                          disabled={i === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSlide(i, -1);
                          }}
                          title="Omhoog"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-foreground/40 hover:text-foreground disabled:opacity-30"
                          disabled={i === slideCount - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSlide(i, 1);
                          }}
                          title="Omlaag"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-foreground/40 hover:text-destructive disabled:opacity-30"
                          disabled={slideCount <= 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSlide(i);
                          }}
                          title="Verwijder slide"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </div>
                    <div>
                      <label className={labelCls}>Kicker</label>
                      <input
                        className={inputCls}
                        value={s.kicker}
                        onChange={(e) => patchSlide(i, { kicker: e.target.value })}
                        data-testid={`slide-${i}-kicker`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Titel</label>
                      <textarea
                        className={`${inputCls} resize-y`}
                        rows={2}
                        value={s.title}
                        onChange={(e) => patchSlide(i, { title: e.target.value })}
                        data-testid={`slide-${i}-title`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Tekst</label>
                      <textarea
                        className={`${inputCls} resize-y`}
                        rows={3}
                        value={s.body}
                        onChange={(e) => patchSlide(i, { body: e.target.value })}
                        data-testid={`slide-${i}-body`}
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setContent((c) => ({ ...c, slides: [...c.slides, emptySlide()] }));
                    setActiveSlide(slideCount);
                  }}
                  data-testid="add-slide"
                  className="w-full border border-dashed border-foreground/30 py-2.5 font-['Space_Mono'] text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/60 flex items-center justify-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Slide toevoegen
                </button>
              </section>
            )}

            {format === "single" && (
              <section className="border border-foreground/20 p-4 space-y-3">
                <div>
                  <label className={labelCls}>Kicker</label>
                  <input
                    className={inputCls}
                    value={content.single.kicker}
                    onChange={(e) =>
                      patch({ single: { ...content.single, kicker: e.target.value } })
                    }
                    data-testid="single-kicker"
                  />
                </div>
                <div>
                  <label className={labelCls}>Kop</label>
                  <textarea
                    className={`${inputCls} resize-y`}
                    rows={3}
                    value={content.single.headline}
                    onChange={(e) =>
                      patch({ single: { ...content.single, headline: e.target.value } })
                    }
                    data-testid="single-headline"
                  />
                </div>
                <div>
                  <label className={labelCls}>Subtekst</label>
                  <textarea
                    className={`${inputCls} resize-y`}
                    rows={3}
                    value={content.single.sub}
                    onChange={(e) =>
                      patch({ single: { ...content.single, sub: e.target.value } })
                    }
                    data-testid="single-sub"
                  />
                </div>
              </section>
            )}

            {format === "quote" && (
              <section className="border border-foreground/20 p-4 space-y-3">
                <div>
                  <label className={labelCls}>Quote</label>
                  <textarea
                    className={`${inputCls} resize-y`}
                    rows={4}
                    value={content.quote.quote}
                    onChange={(e) =>
                      patch({ quote: { ...content.quote, quote: e.target.value } })
                    }
                    data-testid="quote-text"
                  />
                </div>
                <div>
                  <label className={labelCls}>Naam / bron</label>
                  <input
                    className={inputCls}
                    value={content.quote.attribution}
                    onChange={(e) =>
                      patch({
                        quote: { ...content.quote, attribution: e.target.value },
                      })
                    }
                    data-testid="quote-attribution"
                  />
                </div>
              </section>
            )}

            {/* AI background */}
            <section className="border border-foreground/20 p-4 space-y-3">
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                AI-achtergrond (optioneel)
              </p>
              <textarea
                className={`${inputCls} resize-y`}
                rows={2}
                placeholder="Engelse beschrijving van de achtergrond (zonder tekst in beeld)…"
                value={content.imagePrompt}
                onChange={(e) => patch({ imagePrompt: e.target.value })}
                data-testid="image-prompt"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={generateBackground}
                  disabled={backgroundMutation.isPending}
                  data-testid="generate-background"
                  className="flex items-center gap-2 px-3 py-2 border border-foreground/40 font-['Space_Mono'] text-[11px] uppercase tracking-widest disabled:opacity-50 hover:border-foreground"
                >
                  {backgroundMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  Genereer achtergrond
                </button>
                {content.backgroundImage && (
                  <button
                    type="button"
                    onClick={() => patch({ backgroundImage: null })}
                    data-testid="remove-background"
                    className="flex items-center gap-2 px-3 py-2 border border-foreground/25 font-['Space_Mono'] text-[11px] uppercase tracking-widest text-foreground/60 hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                    Verwijder achtergrond
                  </button>
                )}
              </div>
              <p className="font-['Inter'] text-xs text-muted-foreground">
                Tekst komt nooit in de AI-afbeelding — die blijft scherpe HTML
                erbovenop. Genereren duurt even.
              </p>
            </section>

            {/* Export */}
            <section className="border border-foreground/20 p-4 space-y-2">
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Downloaden
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void exportPng()}
                  disabled={exporting !== null}
                  data-testid="export-png"
                  className="flex items-center gap-2 px-3 py-2 bg-foreground text-background font-['Space_Mono'] text-[11px] uppercase tracking-widest disabled:opacity-50"
                >
                  {exporting === "png" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {format === "carousel" ? "PNG (deze slide)" : "PNG"}
                </button>
                {format === "carousel" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void exportAllPngs()}
                      disabled={exporting !== null}
                      data-testid="export-all-pngs"
                      className="flex items-center gap-2 px-3 py-2 border border-foreground/40 font-['Space_Mono'] text-[11px] uppercase tracking-widest disabled:opacity-50 hover:border-foreground"
                    >
                      {exporting === "pngs" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileImage className="w-3.5 h-3.5" />
                      )}
                      Alle slides (PNG)
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportPdf()}
                      disabled={exporting !== null}
                      data-testid="export-pdf"
                      className="flex items-center gap-2 px-3 py-2 border border-foreground/40 font-['Space_Mono'] text-[11px] uppercase tracking-widest disabled:opacity-50 hover:border-foreground"
                    >
                      {exporting === "pdf" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5" />
                      )}
                      PDF (documentpost)
                    </button>
                  </>
                )}
              </div>
              {format === "carousel" && (
                <p className="font-['Inter'] text-xs text-muted-foreground pt-1">
                  Upload de PDF als document bij je LinkedIn-post voor een
                  swipebare carrousel.
                </p>
              )}
            </section>
          </div>

          {/* ── Right: live preview ──────────────────────────────── */}
          <div className="lg:sticky lg:top-20 space-y-3">
            {format === "carousel" && (
              <div className="flex flex-wrap gap-1.5">
                {content.slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveSlide(i)}
                    data-testid={`preview-slide-${i}`}
                    className={`px-2.5 py-1.5 font-['Space_Mono'] text-[11px] border ${
                      i === activeSlide
                        ? "bg-foreground text-background border-foreground"
                        : "border-foreground/25 text-foreground/60 hover:text-foreground"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <div ref={previewBoxRef} className="w-full">
              <div
                className="border border-foreground/20 shadow-[6px_6px_0px_hsl(var(--foreground)/0.12)] overflow-hidden"
                style={{ width: w * scale, height: h * scale }}
                data-testid="visual-preview"
              >
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    width: w,
                    height: h,
                  }}
                >
                  <VisualCanvas
                    content={content}
                    slideIndex={format === "carousel" ? activeSlide : 0}
                  />
                </div>
              </div>
            </div>
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
              {w} × {h} px — {FORMAT_LABELS[format]}
            </p>
          </div>
        </div>
      </div>

      {/* Offscreen export stage: full-size DOM, one node per page. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: "-3000px",
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: exportPages }, (_, i) => (
          <VisualCanvas
            key={i}
            content={content}
            slideIndex={i}
            ref={(el) => {
              exportRefs.current[i] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}
