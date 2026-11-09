"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Flame, Target } from "lucide-react";
import { BadgeIcon } from "@/components/badge-icon";
import { Button } from "@/components/button";
import { useMyPlayers } from "@/hooks/use-my-players";
import { useProgress } from "@/components/progress-provider";
import { playerPath } from "@/lib/player";
import { BADGE_IDS, RANKS, rankShare } from "@/lib/progress";
import { BADGE_COPY } from "@/lib/progress-copy";
import { fill, phaseName } from "@/lib/weakness-copy";
import { REPORT_PHASES } from "@/lib/weakness-report";
import { messages } from "@/messages/en";
import styles from "./progress-view.module.css";

/** GAM-01..06: rank, XP, streak, goal, badges, learned puzzles, and a way to delete it all. */
export function ProgressView() {
  const { progress, reset } = useProgress();
  const { players } = useMyPlayers();
  const [asking, setAsking] = useState(false);
  const [resetNote, setResetNote] = useState("");

  if (!progress) {
    return <p role="status">{messages.progressLoading}</p>;
  }

  async function confirmReset() {
    setAsking(false);
    setResetNote((await reset()) ? messages.progressResetDone : messages.progressResetFailed);
  }

  const goalMet = progress.todaySolved >= progress.goal;
  const firstPlayer = players?.[0];
  const rankIndex = Math.max(0, RANKS.findIndex((name) => name === progress.rank));

  return (
    <div className={styles.view}>
      <div className={styles.cards}>
        <section className={`${styles.card} ${styles.rank}`} aria-labelledby="rank-heading">
          <h2 id="rank-heading" className={styles.label}>
            {messages.progressRank}
          </h2>
          <p className={styles.big}>
            <Crown size={28} strokeWidth={1.75} aria-hidden="true" />
            {progress.rank}
          </p>
          <p>{fill(messages.progressXp, { xp: progress.xp })}</p>
          <progress className={styles.bar} max={100} value={rankShare(progress)} aria-label={messages.progressRankBar} />
          <p className={styles.note}>
            {progress.nextRank && progress.nextRankXp !== null
              ? fill(messages.progressToNext, { left: progress.nextRankXp - progress.xp, rank: progress.nextRank })
              : messages.progressTopRank}
          </p>
          <ol className={styles.ladder} aria-label={messages.progressRank}>
            {RANKS.map((name, index) => (
              <li key={name} aria-current={index === rankIndex ? "step" : undefined} className={index <= rankIndex ? styles.reached : undefined}>
                {name}
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.card} aria-labelledby="streak-heading">
          <h2 id="streak-heading" className={styles.label}>
            {messages.progressStreak}
          </h2>
          <p className={styles.big}>
            <Flame size={28} strokeWidth={1.75} aria-hidden="true" />
            {progress.streak === 1 ? messages.progressStreakDay : fill(messages.progressStreakDays, { days: progress.streak })}
          </p>
          <p>{fill(messages.progressBest, { days: progress.bestStreak })}</p>
          <p className={styles.note}>{messages.progressRestNote}</p>
        </section>

        <section className={styles.card} aria-labelledby="goal-heading">
          <h2 id="goal-heading" className={styles.label}>
            {messages.progressGoal}
          </h2>
          <p className={styles.big}>
            <Target size={28} strokeWidth={1.75} aria-hidden="true" />
            {fill(messages.progressGoalCount, { solved: Math.min(progress.todaySolved, progress.goal), goal: progress.goal })}
          </p>
          <progress className={styles.bar} max={progress.goal} value={Math.min(progress.todaySolved, progress.goal)} aria-label={messages.progressGoalBar} />
          {goalMet ? (
            <p className={styles.met}>{messages.progressGoalDone}</p>
          ) : (
            <p className={styles.note}>
              {progress.xp === 0 ? `${messages.progressStart} ` : null}
              {firstPlayer ? <Link href={playerPath(firstPlayer, "puzzles")}>{messages.progressStartLink}</Link> : null}
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="badges-heading" className={styles.section}>
        <h2 id="badges-heading">{messages.progressBadges}</h2>
        <ul className={styles.badges}>
          {BADGE_IDS.map((badge) => {
            const earned = progress.badges.includes(badge);
            return (
              <li key={badge} className={earned ? styles.earned : styles.locked}>
                <span className={styles.badgeIcon}>
                  <BadgeIcon badge={badge} size={28} />
                </span>
                <span className={styles.badgeText}>
                  <strong>{BADGE_COPY[badge].name}</strong>
                  <span className={styles.status}>{earned ? messages.progressBadgeEarned : messages.progressBadgeLocked}</span>
                  <span className={styles.note}>{BADGE_COPY[badge].how}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="learned-heading" className={styles.section}>
        <h2 id="learned-heading">{messages.progressLearned}</h2>
        <p className={styles.note}>{messages.progressLearnedNote}</p>
        <ul className={styles.phases}>
          {REPORT_PHASES.map((phase) => (
            <li key={phase}>
              <span>{phaseName(phase)}</span>
              <strong>{progress.learnedByPhase[phase]}</strong>
            </li>
          ))}
        </ul>
        <p>{fill(messages.progressLessons, { count: progress.lessonsDone.length, games: progress.reviewed })}</p>
      </section>

      <section aria-labelledby="reset-heading" className={styles.section}>
        <h2 id="reset-heading" className="visually-hidden">
          {messages.progressReset}
        </h2>
        {asking ? (
          <div className={styles.confirm} role="group" aria-labelledby="reset-ask">
            <p id="reset-ask">{messages.progressResetAsk}</p>
            <div className={styles.actions}>
              <Button onClick={() => void confirmReset()}>{messages.progressResetConfirm}</Button>
              <Button variant="secondary" onClick={() => setAsking(false)} autoFocus>
                {messages.progressResetCancel}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="tertiary" onClick={() => setAsking(true)}>
            {messages.progressReset}
          </Button>
        )}
        <p aria-live="polite">{resetNote}</p>
      </section>
    </div>
  );
}
