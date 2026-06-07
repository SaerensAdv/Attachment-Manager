import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PlacesConfigError,
  fetchPlacesReport,
  placesSearchText,
  placesLimiter,
  placesCache,
} from "./places";

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A Places searchText response holding a single place. */
function placeResponse(p: {
  name: string;
  rating?: number;
  reviews?: number;
  primaryType?: string;
  status?: string;
}): unknown {
  return {
    places: [
      {
        displayName: { text: p.name },
        rating: p.rating,
        userRatingCount: p.reviews,
        primaryType: p.primaryType,
        formattedAddress: "Teststraat 1, Gent",
        businessStatus: p.status ?? "OPERATIONAL",
      },
    ],
  };
}

describe("places client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
    fetchMock = vi.fn(async () =>
      jsonResponse(placeResponse({ name: "Default", rating: 4.5, reviews: 50 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    placesLimiter.reset();
    placesCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("throws PlacesConfigError when the key is missing", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await expect(fetchPlacesReport("Klant Gent", [])).rejects.toThrow(
      PlacesConfigError,
    );
  });

  it("builds a report for the client and competitors with signals", async () => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const q = String(body.textQuery);
      if (q.includes("Klant")) {
        return jsonResponse(
          placeResponse({ name: "Klant BV", rating: 3.6, reviews: 12 }),
        );
      }
      return jsonResponse(
        placeResponse({ name: "Concurrent NV", rating: 4.7, reviews: 300 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchPlacesReport("Klant Gent", ["Concurrent Gent"]);
    expect(out.text).toContain("Eigen Google-listing");
    expect(out.text).toContain("Klant BV");
    expect(out.text).toContain("Concurrenten");
    expect(out.text).toContain("Concurrent NV");
    expect(out.text).toContain("== Signalen ==");
    // Client rating 3.6 < 4.0 → low-rating warning; reviews 12 < 20 → few-reviews.
    expect(out.text).toMatch(/rating van 3\.6|3\.6/);
    expect(out.records).toHaveLength(2);
    expect(out.records[0].role).toBe("client");
  });

  it("reports a missing listing without throwing", async () => {
    fetchMock = vi.fn(async () => jsonResponse({ places: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchPlacesReport("Onbekend BV", []);
    expect(out.text).toContain("geen Google-listing gevonden");
    expect(out.records[0].found).toBe(false);
  });

  it("caches identical queries within the TTL", async () => {
    await placesSearchText("Zelfde Query", "BE");
    await placesSearchText("Zelfde Query", "BE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 403 as an auth error", async () => {
    fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "key invalid" } }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(placesSearchText("X", "BE")).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
  });
});
