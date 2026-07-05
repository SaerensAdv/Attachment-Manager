import { describe, expect, it } from "vitest";
import { parseVisualPlanJson, buildVisualPlanPrompt } from "./visual-plan";

const fullPlan = {
  format: "carousel",
  slides: [
    { kicker: "Google Ads", title: "Hook hier", body: "" },
    { kicker: "Stap 1", title: "Meet je waarde", body: "Eerste zin." },
  ],
  single: { kicker: "Google Ads", headline: "Sterke kop", sub: "Eén zin." },
  quote: { quote: "Krachtige uitspraak.", attribution: "Axel Saerens" },
  imagePrompt: "abstract dark background",
  notes: "Carrousel past hier het best.",
};

describe("parseVisualPlanJson", () => {
  it("parses a clean JSON response", () => {
    const plan = parseVisualPlanJson(JSON.stringify(fullPlan), null);
    expect(plan.format).toBe("carousel");
    expect(plan.slides).toHaveLength(2);
    expect(plan.single.headline).toBe("Sterke kop");
    expect(plan.quote.quote).toBe("Krachtige uitspraak.");
    expect(plan.imagePrompt).toBe("abstract dark background");
  });

  it("strips markdown fences and surrounding prose", () => {
    const raw = `Hier is het plan:\n\`\`\`json\n${JSON.stringify(fullPlan)}\n\`\`\`\nSucces!`;
    const plan = parseVisualPlanJson(raw, null);
    expect(plan.format).toBe("carousel");
    expect(plan.slides).toHaveLength(2);
  });

  it("honours a forced format over the model's pick", () => {
    const plan = parseVisualPlanJson(JSON.stringify(fullPlan), "quote");
    expect(plan.format).toBe("quote");
  });

  it("never recommends a format it has no content for", () => {
    const noSlides = { ...fullPlan, format: "carousel", slides: [] };
    const plan = parseVisualPlanJson(JSON.stringify(noSlides), null);
    expect(plan.format).toBe("single");
  });

  it("drops malformed slides and clamps garbage fields to strings", () => {
    const messy = {
      ...fullPlan,
      slides: [
        { kicker: 7, title: "Geldig", body: null },
        "geen object",
        { kicker: "x", title: "", body: "titel ontbreekt" },
      ],
      notes: 42,
    };
    const plan = parseVisualPlanJson(JSON.stringify(messy), null);
    expect(plan.slides).toEqual([{ kicker: "", title: "Geldig", body: "" }]);
    expect(plan.notes).toBe("");
  });

  it("throws when there is no JSON at all", () => {
    expect(() => parseVisualPlanJson("Sorry, dat lukt niet.", null)).toThrow();
  });

  it("throws when the JSON contains no usable content", () => {
    const empty = { format: "single", slides: [], single: {}, quote: {} };
    expect(() => parseVisualPlanJson(JSON.stringify(empty), null)).toThrow();
  });
});

describe("buildVisualPlanPrompt", () => {
  it("mentions the forced format when given", () => {
    expect(buildVisualPlanPrompt("quote")).toContain('"quote"');
  });

  it("asks the model to choose when no format is forced", () => {
    expect(buildVisualPlanPrompt(null)).toContain("kies het formaat");
  });
});
