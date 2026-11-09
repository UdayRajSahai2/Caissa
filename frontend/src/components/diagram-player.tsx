"use client";

import { ReviewBoard } from "@/components/review-board";
import { StepControls } from "@/components/step-controls";
import { useStepper } from "@/hooks/use-stepper";
import { playBoardSound } from "@/lib/board-sound";
import { moveSoundKind } from "@/lib/chess-board";
import { diagramPositions, type LearnDiagram } from "@/lib/learn";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./diagram-player.module.css";

/**
 * A lesson board that steps through its moves (LRN-02): starts paused on the position,
 * always from White's side so the text and the board agree,
 * slides each move in, and reads the caption aloud through a polite live region.
 */
export function DiagramPlayer({ diagram, label }: { diagram: LearnDiagram; label: string }) {
  const positions = diagramPositions(diagram);
  const stepper = useStepper(positions.length, (index) => {
    const move = diagram.steps[index - 1];
    const before = positions[index - 1];
    if (move && before) {
      playBoardSound(moveSoundKind(before, move.uci, move.san));
    }
  });
  const move = stepper.step > 0 ? diagram.steps[stepper.step - 1] : undefined;
  const fen = move ? (positions[stepper.step - 1] ?? diagram.fen) : diagram.fen;
  const hasMoves = diagram.steps.length > 0;

  return (
    <figure className={styles.diagram}>
      <ReviewBoard
        fen={fen}
        orientation="white"
        travelUci={move?.uci}
        label={label}
      />
      <figcaption className={styles.side}>
        {hasMoves ? (
          <p className={styles.counter}>
            {stepper.step === 0
              ? messages.diagramStart
              : fill(messages.diagramMove, { n: stepper.step, total: diagram.steps.length })}
          </p>
        ) : null}
        <p className={styles.caption} aria-live="polite">
          {move ? <strong className={styles.san}>{move.san}</strong> : null}
          {move ? " " : null}
          {move ? move.caption : diagram.caption}
        </p>
        {hasMoves ? (
          <StepControls
            step={stepper.step}
            last={stepper.last}
            playing={stepper.playing}
            onGo={stepper.go}
            onToggle={stepper.toggle}
          />
        ) : null}
      </figcaption>
    </figure>
  );
}
