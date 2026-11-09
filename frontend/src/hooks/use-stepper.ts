"use client";

import { useEffect, useRef, useState } from "react";

/** Time on each step while playing: long enough to read the caption (LSN-03, LRN-02). */
export const STEP_MS = 2600;

/**
 * Step-through state for a replay: starts paused on step 0 (Section 14.6), plays one step per
 * STEP_MS, and stops at the end. onEnter runs for every step the user or the timer moves to.
 */
export function useStepper(total: number, onEnter: (index: number) => void) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  const last = Math.max(0, total - 1);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (step < last) {
        enter.current(step + 1);
        setStep(step + 1);
      } else {
        setPlaying(false);
      }
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step, last]);

  function go(next: number) {
    const target = Math.max(0, Math.min(last, next));
    enter.current(target);
    setStep(target);
  }

  function toggle() {
    if (playing) {
      setPlaying(false);
      return;
    }
    go(step >= last ? 0 : step + 1);
    setPlaying(true);
  }

  function reset() {
    setStep(0);
    setPlaying(false);
  }

  return { step, last, playing, go, toggle, reset };
}
