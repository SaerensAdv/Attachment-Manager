import type { Transition, Variants } from "framer-motion";

// Shared editorial easing — a calm, slightly weighted ease-out that matches the
// newsroom feel. Reused across reveals and route transitions for consistency.
export const easeEditorial = [0.22, 1, 0.36, 1] as const;

export const revealTransition: Transition = {
  duration: 0.6,
  ease: easeEditorial,
};

// Subtle fade + short rise — content arrives, it does not slide in.
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

// Route transitions stay fast and opacity-only so the content the user came for
// is never delayed and layout never shifts.
export const pageTransition: Transition = {
  duration: 0.28,
  ease: easeEditorial,
};
