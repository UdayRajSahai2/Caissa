"use client";

import { useEffect, useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/button";
import { MasteryBars } from "@/components/mastery-bars";
import { useProgress } from "@/components/progress-provider";
import { PuzzleAttempt, type PuzzleOutcome } from "@/components/puzzle-attempt";
import { SoundToggle } from "@/components/sound-toggle";
import { sideToMove } from "@/lib/chess-board";
import { puzzleRef, scheduleFor, type ProgressData, type ScheduleState } from "@/lib/progress";
import { buildPuzzleSet, learnedCount, PUZZLE_FOCUSES, puzzleKey, type PuzzleFocus } from "@/lib/puzzle-set";
import type { ReviewMove } from "@/lib/review";
import { fill, phaseName } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./puzzle-trainer.module.css";

const SCHEDULE_TEXT: Record<ScheduleState | "new", string> = {
  due: messages.puzzleScheduleDue,
  later: messages.puzzleScheduleLater,
  learned: messages.puzzleScheduleLearned,
  new: messages.puzzleScheduleNew,
};

/**
 * A set of puzzles from the player's blunders, one at a time, weakest phase first (PUZ-03, Section 14.7).
 * Signed in, due puzzles come first and learned ones leave the set (PUZ-06); every first answer earns XP (GAM-02).
 */
export function PuzzleTrainer({ moves, username }: { moves: readonly ReviewMove[]; username: string }) {
  const { progress, player, loadPlayer, record } = useProgress();
  const [focus, setFocus] = useState<PuzzleFocus>("weakest");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, PuzzleOutcome>>({});
  const [feedback, setFeedback] = useState("");
  // Fixed when the set opens, so a puzzle does not jump away the moment it is answered.
  const [schedule, setSchedule] = useState<Map<string, ScheduleState> | undefined>(undefined);
  const doneId = useId();
  const ready = progress !== null && player === username.toLowerCase();

  useEffect(() => {
    loadPlayer(username);
  }, [username, loadPlayer]);

  useEffect(() => {
    if (ready && schedule === undefined) {
      setSchedule(scheduleFor(progress));
    }
  }, [ready, progress, schedule]);

  const puzzles = buildPuzzleSet(moves, focus, schedule);
  const current = puzzles[index];
  const keys = puzzles.map(puzzleKey);
  const solved = keys.filter((key) => results[key] === "solved").length;
  const missed = keys.filter((key) => results[key] === "missed").length;
  const due = schedule ? puzzles.filter((move) => schedule.get(puzzleRef(move)) === "due").length : 0;
  const learned = schedule ? learnedCount(moves, focus, schedule) : 0;

  function chooseFocus(next: PuzzleFocus) {
    setFocus(next);
    setIndex(0);
  }

  function onResult(move: ReviewMove, outcome: PuzzleOutcome) {
    const key = puzzleKey(move);
    if (results[key]) {
      return;
    }
    setResults((previous) => ({ ...previous, [key]: outcome }));
    void record(`me/activity/puzzle/${puzzleRef(move)}/${outcome}`, {
      player: username,
      phase: move.phase || "opening",
    }).then((next) => setFeedback(next ? feedbackText(next) : ""));
  }

  function restart() {
    setResults((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !keys.includes(key))));
    setSchedule(ready ? scheduleFor(progress) : undefined);
    setIndex(0);
    setFeedback("");
  }

  return (
    <div className={styles.trainer}>
      <div className={styles.bar}>
        <div className={styles.group} role="group" aria-label={messages.puzzleFocusLabel}>
          <p aria-hidden="true">{messages.puzzleFocusLabel}</p>
          <div className={styles.switch}>
            {PUZZLE_FOCUSES.map((option) => (
              <button key={option} type="button" aria-pressed={focus === option} onClick={() => chooseFocus(option)}>
                {option === "weakest" ? messages.puzzleFocusWeakest : phaseName(option)}{" "}
                <span className={styles.count}>{buildPuzzleSet(moves, option, schedule).length}</span>
              </button>
            ))}
          </div>
        </div>
        <SoundToggle />
      </div>

      {schedule && (due > 0 || learned > 0) ? (
        <p className={styles.schedule}>
          {[due > 0 ? fill(messages.puzzleDueCount, { due }) : "", learned > 0 ? fill(messages.puzzleLearnedCount, { learned }) : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {puzzles.length === 0 ? <p>{learned > 0 ? messages.puzzleAllLearned : messages.puzzleNoneInFocus}</p> : null}

      {puzzles.length > 0 && !current ? (
        <section className={styles.done} aria-labelledby={doneId}>
          <h3 id={doneId}>{messages.puzzleDoneHeading}</h3>
          <p>{fill(messages.puzzleDone, { total: puzzles.length, solved })}</p>
          <Button onClick={restart}>
            <RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.puzzleRestart}
          </Button>
        </section>
      ) : null}

      {current ? (
        <>
          <div className={styles.progress}>
            <h3>{fill(messages.puzzleCounter, { n: index + 1, total: puzzles.length })}</h3>
            <p>{fill(messages.puzzleTally, { solved, missed })}</p>
            {schedule ? <p className={styles.tag}>{SCHEDULE_TEXT[schedule.get(puzzleRef(current)) ?? "new"]}</p> : null}
          </div>
          <PuzzleAttempt
            key={puzzleKey(current)}
            move={current}
            orientation={sideToMove(current.fen)}
            onResult={(outcome) => onResult(current, outcome)}
          >
            <p className={styles.feedback} aria-live="polite">
              {feedback}
            </p>
            <div className={styles.nav}>
              <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                {messages.puzzlePrevious}
              </Button>
              <Button onClick={() => setIndex(index + 1)}>{messages.puzzleNext}</Button>
            </div>
          </PuzzleAttempt>
        </>
      ) : null}

      <MasteryBars username={username} moves={moves} />
    </div>
  );
}

function feedbackText(progress: ProgressData): string {
  const parts = progress.xpGained > 0 ? [fill(messages.xpGained, { xp: progress.xpGained })] : [];
  parts.push(
    progress.todaySolved >= progress.goal
      ? messages.goalMetNow
      : fill(messages.goalProgress, { solved: progress.todaySolved, goal: progress.goal }),
  );
  return parts.join(" · ");
}
