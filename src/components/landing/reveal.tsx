"use client";

import { useEffect } from "react";

/**
 * Fades sections in as they scroll into view. Content stays visible without JavaScript: elements are only hidden
 * once this has mounted and marked the document, and reduced-motion users skip the effect entirely.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("reveal-ready");
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach(el => observer.observe(el));
    return () => { observer.disconnect(); root.classList.remove("reveal-ready"); };
  }, []);
  return null;
}
