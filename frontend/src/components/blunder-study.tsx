"use client";

import { useState } from "react";
import { Timer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { PuzzleAttempt } from "@/components/puzzle-attempt";
import { ReviewBoard } from "@/components/review-board";
import type { BoardOrientation } from "@/lib/chess-board";
import {
  arrowCaption,
  arrowEnds,
  betterMoveLabel,
  heatmap,
  heatmapSentence,
  moveLabel,
  puzzlesFor,
  readReviewMoves,
  weakestPoints,
  weakestSentence,
  type ReviewMove,
} from "@/lib/review";
import { messages } from "@/messages/en";
import styles from "./blunder-study.module.css";

export function BlunderStudy({
  blunders,
  orientation,
}: {
  blunders: readonly unknown[];
  orientation: BoardOrientation;
}) {
  const moves = readReviewMoves(blunders);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  if (moves.length === 0) {
    return <p>{messages.blunderNone}</p>;
  }
  const current = moves[Math.min(index, moves.length - 1)];
  if (!current) {
    return <p>{messages.blunderNone}</p>;
  }
  const heading = moves.length === 1 ? messages.blunderOne : `${moves.length} ${messages.blundersMany}`;
  const better = betterMoveLabel(current);
  const caption = arrowCaption(current.playedUci, current.bestUci);
  const atEnd = index >= moves.length - 1;

  function step(next: number) {
    setIndex(Math.min(Math.max(next, 0), moves.length - 1));
  }

  return (
    <div className={styles.study}>
      <h4 className={styles.heading}>
        <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
        {heading}
      </h4>
      <div className={styles.stage}>
        <div>
          {current.fen ? (
            <ReviewBoard
              fen={current.fen}
              orientation={orientation}
              travelUci={current.playedUci}
              arrows={arrowsFor(current)}
              label={moveLabel(current.ply, current.san)}
            />
          ) : (
            <p>{messages.reviewNoPosition}</p>
          )}
        </div>
        <div className={styles.copy}>
          <p className={styles.move}>{moveLabel(current.ply, current.san)}</p>
          {caption ? <p className={styles.hidden}>{caption}</p> : null}
          <p>{messages.reviewYouPlayed}</p>
          <p>{better ? `${messages.reviewBetter} ${better}.` : messages.reviewBetterMissing}</p>
          <p className={styles.meta}>
            {capitalize(current.phase)}. {lossText(current.severityCp)}
            {current.underTimePressure ? (
              <>
                .{" "}
                <span className={styles.clock}>
                  <Timer size={16} strokeWidth={1.75} aria-hidden="true" />
                  {messages.timePressure}
                </span>
              </>
            ) : null}
          </p>
          <ul className={styles.legend}>
            <li>
              <span className={styles.playedMark} aria-hidden="true" />
              {messages.reviewPlayedKey}
            </li>
            <li>
              <span className={styles.betterMark} aria-hidden="true" />
              {messages.reviewBetterKey}
            </li>
          </ul>
          <div className={styles.nav}>
            <Button variant="secondary" onClick={() => step(index - 1)} disabled={index === 0}>
              {messages.reviewPrevious}
            </Button>
            <p className={styles.progress}>
              {index + 1} {messages.reviewOf} {moves.length}
            </p>
            <Button variant="secondary" onClick={() => step(index + 1)} disabled={atEnd}>
              {messages.reviewNext}
            </Button>
          </div>
          {shown ? null : <Button onClick={() => setShown(true)}>{messages.showPattern}</Button>}
        </div>
      </div>
      {shown ? <Pattern moves={moves} orientation={orientation} /> : null}
    </div>
  );
}

function Pattern({ moves, orientation }: { moves: readonly ReviewMove[]; orientation: BoardOrientation }) {
  const counts = heatmap(moves);
  const points = weakestPoints(moves);
  const puzzles = puzzlesFor(moves, points);
  return (
    <div className={styles.pattern}>
      <h4>{messages.heatmapHeading}</h4>
      <div className={styles.heat}>
        <ReviewBoard fen="" orientation={orientation} marks={counts} label={messages.heatmapHeading} />
      </div>
      <p>{heatmapSentence(counts)}</p>
      <p>{weakestSentence(points)}</p>
      <h4>{messages.puzzleHeading}</h4>
      {puzzles.length > 0 ? (
        puzzles.map((puzzle) => (
          <PuzzleAttempt key={`${puzzle.gameId}:${puzzle.ply}`} move={puzzle} orientation={orientation} />
        ))
      ) : (
        <p>{messages.puzzleNone}</p>
      )}
    </div>
  );
}

function arrowsFor(move: ReviewMove): { uci: string; tone: "blunder" | "best" }[] {
  const arrows: { uci: string; tone: "blunder" | "best" }[] = [];
  if (arrowEnds(move.playedUci)) {
    arrows.push({ uci: move.playedUci, tone: "blunder" });
  }
  if (arrowEnds(move.bestUci) && move.bestUci !== move.playedUci) {
    arrows.push({ uci: move.bestUci, tone: "best" });
  }
  return arrows;
}

function lossText(cp: number): string {
  if (cp >= 10_000) {
    return messages.reviewMate;
  }
  return `${cp} ${messages.lostCp}`;
}

function capitalize(value: string): string {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
