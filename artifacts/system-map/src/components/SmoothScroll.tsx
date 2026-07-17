import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import Lenis from "lenis";

// Premium smooth-scroll layer for the editorial pages. Deliberately NOT active
// on the full-screen graph routes — the Kaart ("/") and the Workspace Graph
// ("/graph"). Both are non-scrolling canvases with their own wheel-driven
// zoom/pan (react-zoom-pan-pinch), so Lenis's rAF wheel-smoothing adds nothing
// and actively fights the canvas. Fully disabled under reduced-motion.
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const [location] = useLocation();
  const isFullscreenCanvas = location === "/" || location === "/graph";

  useEffect(() => {
    if (isFullscreenCanvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [isFullscreenCanvas]);

  // Each route should open at its masthead, not wherever the previous page was
  // scrolled to. Reset instantly so it never looks like an animated jump.
  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return <>{children}</>;
}
