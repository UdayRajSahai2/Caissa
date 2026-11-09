"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Eye, Lightbulb, MapPin, XCircle } from "lucide-react";
import { Button } from "@/components/button";
import { ReviewBoard } from "@/components/review-board";
import { playBoardSound } from "@/lib/board-sound";
import { moveSoundKind, ownsSquare, readPieces, type BoardOrientation } from "@/lib/chess-board";
import type { HeatPiece } from "@/lib/heat-board";
import { sideName } from "@/lib/lesson-copy";
import { arrowCaption, arrowEnds, betterMoveLabel, isBestAttempt, type ReviewMove } from "@/lib/review";
import { fill, pieceName } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./puzzle-attempt.module.css";

export type PuzzleOutcome = "solved" | "missed";

type Status = "playing" | "solved" | "revealed";

/** 0: no help. 1: the piece to move is shown. 2: its target square is shown too. */
type HintLevel = 0 | 1 | 2;

/** A wrong move stays on the board this long, then the piece slides back. */
const WRONG_SNAP_MS = 700;
/** The result chime follows the move sound instead of covering it. */
const CHIME_DELAY_S = 0.14;

/**
 * One puzzle from the player's own blunder (PUZ-01, PUZ-04, PUZ-05).
 * Click, drag, or keyboard to move; every result is written as text as well as heard.
 * Hints come in steps, like Chess.com: first the piece to move, then where it goes, then the solution.
 * Extra content (the trainer's feedback and navigation) sits in the panel beside the board.
 */
export function PuzzleAttempt({
  move,
  orientation,
  onResult,
  children,
}: {
  move: ReviewMove;
  orientation: BoardOrientation;
  onResult?: (outcome: PuzzleOutcome) => void;
  children?: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [travel, setTravel] = useState<string | null>(null);
  const [wrongSquare, setWrongSquare] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("playing");
  const [missed, setMissed] = useState(false);
  const [hint, setHint] = useState<HintLevel>(0);
  const [spoken, setSpoken] = useState("");
  const reported = useRef(false);
  const snapTimer = useRef(0);
  const best = arrowEnds(move.bestUci);
  const bestLabel = betterMoveLabel(move);
  const mover = best ? readPieces(move.fen).find((piece) => piece.square === best.from) : undefined;
  const moverName = mover ? pieceName(mover.code.toLowerCase() as HeatPiece) : "";

  useEffect(() => () => window.clearTimeout(snapTimer.current), []);

  function report(outcome: PuzzleOutcome) {
    if (!reported.current) {
      reported.current = true;
      onResult?.(outcome);
    }
  }

  function attempt(from: string, to: string) {
    if (status !== "playing") {
      return;
    }
    window.clearTimeout(snapTimer.current);
    setSelected(null);
    if (isBestAttempt(from, to, move.bestUci)) {
      playBoardSound(moveSoundKind(move.fen, move.bestUci, move.bestSan));
      playBoardSound("correct", CHIME_DELAY_S);
      setTravel(move.bestUci);
      setWrongSquare(null);
      setStatus("solved");
      setSpoken("");
      report(missed ? "missed" : "solved");
      return;
    }
    playBoardSound(moveSoundKind(move.fen, `${from}${to}`));
    playBoardSound("wrong", CHIME_DELAY_S);
    setTravel(`${from}${to}`);
    setWrongSquare(to);
    setMissed(true);
    setSpoken("");
    snapTimer.current = window.setTimeout(() => {
      setTravel(null);
      setWrongSquare(null);
    }, WRONG_SNAP_MS);
  }

  function choose(square: string) {
    if (status !== "playing") {
      return;
    }
    if (ownsSquare(move.fen, square) && square !== selected) {
      setSelected(square);
      setSpoken(fill(messages.puzzleSelected, { square }));
      return;
    }
    if (!selected || square === selected) {
      setSelected(null);
      return;
    }
    attempt(selected, square);
  }

  function nextHint() {
    window.clearTimeout(snapTimer.current);
    setTravel(null);
    setWrongSquare(null);
    // A hint means the puzzle no longer counts as solved on the first try (as on Chess.com).
    setMissed(true);
    setHint((level) => (level === 0 ? 1 : 2));
  }

  function showSolution() {
    window.clearTimeout(snapTimer.current);
    playBoardSound(moveSoundKind(move.fen, move.bestUci, move.bestSan));
    setHint(0);
    setWrongSquare(null);
    setSelected(null);
    setTravel(move.bestUci);
    setStatus("revealed");
    report("missed");
  }

  const done = status !== "playing";
  const hintSquares = !done && best ? (hint === 2 ? [best.from, best.to] : hint === 1 ? [best.from] : []) : [];

  return (
    <article className={styles.puzzle}>
      <div className={styles.layout}>
        <div className={styles.board}>
          <ReviewBoard
            fen={move.fen}
            orientation={orientation}
            label={fill(messages.puzzleToMove, { side: sideName(move.fen) })}
            travelUci={travel ?? undefined}
            selectedSquare={selected}
            wrongSquare={wrongSquare}
            hintSquares={hintSquares}
            onSquare={choose}
            canDrag={(square) => !done && ownsSquare(move.fen, square)}
            onDrop={attempt}
            arrows={done ? [{ uci: move.bestUci, tone: "best" }] : []}
          />
        </div>
        <div className={styles.side}>
          <p className={styles.prompt}>{fill(messages.puzzleToMove, { side: sideName(move.fen) })}</p>
          <p className={styles.context}>
            {fill(messages.puzzleGameContext, { game: move.gameId, move: Math.ceil(move.ply / 2), san: move.san })}
          </p>
          <p className="visually-hidden" aria-live="polite">
            {spoken}
          </p>
          <div role="status" className={styles.status}>
            {status === "solved" ? (
              <p className={styles.right}>
                <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
                {fill(messages.puzzleCorrect, { best: bestLabel })}
              </p>
            ) : null}
            {status === "revealed" ? (
              <p className={styles.revealed}>
                <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
                {fill(messages.puzzleSolutionShown, { best: bestLabel })}
              </p>
            ) : null}
            {status === "playing" && hint > 0 && best ? (
              <p className={styles.hinted}>
                <Lightbulb size={20} strokeWidth={1.75} aria-hidden="true" />
                {hint === 1
                  ? fill(messages.puzzleHintPiece, { piece: moverName, square: best.from })
                  : fill(messages.puzzleHintTarget, { piece: moverName, from: best.from, to: best.to })}
              </p>
            ) : null}
            {status === "playing" && missed && hint === 0 ? (
              <p className={styles.wrong}>
                <XCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                {messages.puzzleNotQuite}
              </p>
            ) : null}
          </div>
          {done && move.replySan ? (
            <p className={styles.context}>{fill(messages.puzzlePunished, { san: move.san, reply: move.replySan })}</p>
          ) : null}
          {done ? <p className="visually-hidden">{arrowCaption(move.playedUci, move.bestUci)}</p> : null}
          {!done ? (
            <div className={styles.actions}>
              {hint < 2 ? (
                <Button variant="secondary" onClick={nextHint} disabled={!best}>
                  {hint === 0 ? (
                    <Lightbulb size={20} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <MapPin size={20} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {hint === 0 ? messages.puzzleHint : messages.puzzleHintMore}
                </Button>
              ) : null}
              <Button variant="tertiary" onClick={showSolution}>
                <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
                {messages.puzzleShowSolution}
              </Button>
            </div>
          ) : null}
          {children}
          <p className={styles.help}>{messages.puzzleKeyboard}</p>
        </div>
      </div>
    </article>
  );
}
