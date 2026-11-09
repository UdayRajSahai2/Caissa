"use client";

import { useEffect, useId } from "react";
import { Award } from "lucide-react";
import { useProgress } from "@/components/progress-provider";
import { masteryByPhase, scheduleFor } from "@/lib/progress";
import { canPractice, type ReviewMove } from "@/lib/review";
import { fill, phaseName } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./mastery-bars.module.css";

/** GAM-04: learned out of available puzzles for each phase, numbers in text beside each bar. */
export function MasteryBars({ username, moves }: { username: string; moves: readonly ReviewMove[] }) {
  const { progress, player, loadPlayer } = useProgress();
  const headingId = useId();

  useEffect(() => {
    loadPlayer(username);
  }, [username, loadPlayer]);

  if (!progress || player !== username.toLowerCase()) {
    return null;
  }
  const rows = masteryByPhase(moves.filter(canPractice), scheduleFor(progress));
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className={styles.mastery} aria-labelledby={headingId}>
      <h3 id={headingId}>{messages.masteryHeading}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.phase}>
            <span className={styles.label}>
              {fill(messages.masteryRow, { phase: phaseName(row.phase), learned: row.learned, available: row.available })}
              {row.fixed ? (
                <span className={styles.fixed}>
                  <Award size={16} strokeWidth={1.75} aria-hidden="true" />
                  {messages.masteryFixed}
                </span>
              ) : null}
            </span>
            <progress max={row.available} value={row.learned} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </section>
  );
}
