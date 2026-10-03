"use client";

import { useEffect, useState } from "react";

/** Counts up to a figure once, easing out. Renders the final value on the server and for reduced-motion users. */
export function CountUp({ value, prefix = "", suffix = "", duration = 900 }: { value: number; prefix?: string; suffix?: string; duration?: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{prefix}{shown.toLocaleString("en-NG")}{suffix}</>;
}
