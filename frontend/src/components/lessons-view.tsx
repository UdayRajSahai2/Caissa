"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/button";
import { ReviewBoard } from "@/components/review-board";
import { SoundToggle } from "@/components/sound-toggle";
import { StepControls } from "@/components/step-controls";
import { useStepper } from "@/hooks/use-stepper";
import { playBoardSound } from "@/lib/board-sound";
import { moveSoundKind, sideToMove } from "@/lib/chess-board";
import { buildLessons, lessonSteps, type Lesson, type LessonStep } from "@/lib/lesson";
import { lessonCaption, lessonTitle, lessonWhy } from "@/lib/lesson-copy";
import type { ReviewMove } from "@/lib/review";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./lessons-view.module.css";

/** Lessons from the player's own blunders (LSN-01..04). */
export function LessonsView({ moves }: { moves: readonly ReviewMove[] }) {
  const lessons = buildLessons(moves);
  const [chosen, setChosen] = useState(0);
  const lesson = lessons[chosen] ?? lessons[0];

  if (!lesson) {
    return <p>{messages.lessonsEmpty}</p>;
  }

  return (
    <div className={styles.lessons}>
      <div className={styles.bar}>
        <p>{messages.lessonsIntro}</p>
        <SoundToggle />
      </div>
      <ul className={styles.list} aria-label={messages.lessonsListLabel}>
        {lessons.map((item, index) => (
          <li key={item.id}>
            <button type="button" className={styles.pick} aria-pressed={item === lesson} onClick={() => setChosen(index)}>
              <span className={styles.pickTitle}>{lessonTitle(item)}</span>{" "}
              <span className={styles.pickMeta}>{fill(messages.lessonExamplesCount, { count: item.examples.length })}</span>
            </button>
          </li>
        ))}
      </ul>
      <LessonPlayer key={lesson.id} lesson={lesson} />
    </div>
  );
}

function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const [example, setExample] = useState(0);
  const titleId = useId();
  const move = lesson.examples[example] ?? lesson.examples[0];
  const steps = move ? lessonSteps(move) : [];
  const stepper = useStepper(steps.length, (index) => {
    if (move) {
      playStepSound(move, steps[index]);
    }
  });
  const current = steps[stepper.step];

  if (!move || !current) {
    return null;
  }

  function goExample(next: number) {
    setExample(next);
    stepper.reset();
  }

  return (
    <section className={styles.player} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h3 id={titleId}>{lessonTitle(lesson)}</h3>
        <p>
          <strong>{messages.reportTry}</strong> {lessonWhy(lesson)}
        </p>
      </div>
      <div className={styles.stage}>
        <ReviewBoard
          fen={current.fen}
          orientation={sideToMove(move.fen)}
          travelUci={current.travelUci}
          arrows={current.arrow ? [current.arrow] : []}
          label={messages.lessonBoardLabel}
        />
        <div className={styles.side}>
          <p className={styles.counter}>
            {fill(messages.lessonExample, { n: example + 1, total: lesson.examples.length })}
            <br />
            {fill(messages.lessonStep, { n: stepper.step + 1, total: steps.length })}
          </p>
          <p className={styles.caption} aria-live="polite">
            {lessonCaption(move, current.kind)}
          </p>
          <StepControls
            step={stepper.step}
            last={stepper.last}
            playing={stepper.playing}
            onGo={stepper.go}
            onToggle={stepper.toggle}
          />
          {lesson.examples.length > 1 ? (
            <div className={styles.controls}>
              <Button variant="tertiary" onClick={() => goExample(example - 1)} disabled={example === 0}>
                <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
                {messages.lessonPreviousExample}
              </Button>
              <Button variant="tertiary" onClick={() => goExample(example + 1)} disabled={example === lesson.examples.length - 1}>
                {messages.lessonNextExample}
                <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The step's move sound, so a replay sounds like moves on a real board. */
function playStepSound(move: ReviewMove, step: LessonStep | undefined) {
  if (!step?.travelUci) {
    return;
  }
  const san = step.kind === "played" ? move.san : step.kind === "reply" ? move.replySan : move.bestSan;
  playBoardSound(moveSoundKind(step.fen, step.travelUci, san));
}
