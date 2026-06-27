import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no ResizeObserver; GraphViewer observes its container to track
// dimensions. A no-op keeps the component at its default {800,600} so the
// d3-force layout has a stable viewport to centre on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error - assigning a stub onto the jsdom global.
globalThis.ResizeObserver = ResizeObserverStub;

// Default to "motion allowed" so the standard tests exercise the animated
// (beaded) code path. The reduced-motion test overrides this per-render.
export function setMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

setMatchMedia(false);

afterEach(() => {
  cleanup();
  setMatchMedia(false);
});
