"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

/**
 * Chiffre qui glisse vers sa nouvelle valeur (GSAP).
 * `step` : pas d'affichage pendant l'animation, pour qu'un poids en grammes ne montre pas de décimales parasites.
 */
export function AnimatedNumber({ value, format, step = 1 }: { value: number; format: (n: number) => string; step?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);

  useGSAP(
    () => {
      const el = ref.current;
      const from = shown.current;
      shown.current = value;
      if (!el || from === value || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const o = { x: from };
      gsap.to(o, {
        x: value,
        duration: 0.45,
        ease: "expo.out",
        onUpdate: () => void (el.textContent = format(Math.round(o.x / step) * step)),
        onComplete: () => void (el.textContent = format(value)),
      });
    },
    { dependencies: [value] },
  );

  return (
    <span ref={ref} className="num">
      {format(value)}
    </span>
  );
}
