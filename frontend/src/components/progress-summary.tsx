"use client";

import Link from "next/link";
import { ArrowRight, Crown, Flame, Target } from "lucide-react";
import { useProgress } from "@/components/progress-provider";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./progress-summary.module.css";

/** GAM-01/02: streak, today's goal, and rank at the top of the player's page, with a link to the full progress page. */
export function ProgressSummary() {
  const { progress } = useProgress();
  if (!progress) {
    return null;
  }
  const solved = Math.min(progress.todaySolved, progress.goal);
  return (
    <section className={styles.summary} aria-label={messages.progressTitle}>
      <p>
        <Flame size={20} strokeWidth={1.75} aria-hidden="true" />
        {progress.streak === 1 ? messages.summaryStreakOne : fill(messages.summaryStreak, { days: progress.streak })}
      </p>
      <p className={solved >= progress.goal ? styles.met : undefined}>
        <Target size={20} strokeWidth={1.75} aria-hidden="true" />
        {fill(messages.summaryGoal, { solved, goal: progress.goal })}
      </p>
      <p>
        <Crown size={20} strokeWidth={1.75} aria-hidden="true" />
        {fill(messages.summaryRank, { rank: progress.rank, xp: progress.xp })}
      </p>
      <Link href="/progress" className={styles.link}>
        {messages.summaryLink}
        <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </section>
  );
}
