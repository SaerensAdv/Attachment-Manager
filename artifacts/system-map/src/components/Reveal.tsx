import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { revealTransition, revealVariants } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  // Small per-item delay to stagger groups gently.
  delay?: number;
}

// A restrained scroll reveal: subtle fade + short rise, triggered once as the
// element enters the viewport. Under reduced-motion it renders the final state
// immediately so content is never gated behind motion.
export default function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={revealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ ...revealTransition, delay }}
    >
      {children}
    </motion.div>
  );
}
