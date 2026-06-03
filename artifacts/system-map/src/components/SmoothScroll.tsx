import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import Lenis from "lenis";

// Premium smooth-scroll layer for the editorial pages. Deliberately NOT active
// on the Kaart route ("/") — that page is a full-screen, non-scrolling graph
// with its own wheel-driven interactions, so smooth scroll adds nothing there
// and could fight the canvas. Fully disabled under reduced-motion.
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const [location] = useLocation();
  const isHome = location === "/";

  useEffect(() => {
    if (isHome) return;

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
  }, [isHome]);

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
