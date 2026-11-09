"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  CircleHelp,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/button";
import { useProgress } from "@/components/progress-provider";
import { ReviewBoard } from "@/components/review-board";
import { playBoardSound } from "@/lib/board-sound";
import { moveSoundKind, type BoardOrientation } from "@/lib/chess-board";
import {
  firstStep,
  graphPoints,
  keyMoments,
  longestThink,
  moveNumber,
  reviewGame,
  sideAccuracy,
  verdictCounts,
  VERDICT_SYMBOL,
  type GameMove,
  type MoveVerdict,
  type ReviewedMove,
} from "@/lib/game-review";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./game-review.module.css";

const VERDICTS: readonly MoveVerdict[] = ["best", "good", "inaccuracy", "mistake", "blunder"];
const VERDICT_TEXT: Record<MoveVerdict, string> = {
  best: messages.verdictBest,
  good: messages.verdictGood,
  inaccuracy: messages.verdictInaccuracy,
  mistake: messages.verdictMistake,
  blunder: messages.verdictBlunder,
};
const VERDICT_ICON: Record<MoveVerdict, LucideIcon> = {
  best: Star,
  good: Check,
  inaccuracy: CircleHelp,
  mistake: CircleAlert,
  blunder: TriangleAlert,
};
const GRAPH_W = 600;
const GRAPH_H = 120;
const TIME_H = 80;

/** REV-01..05: the whole game, move by move, with accuracy, labels, and graphs. */
export function GameReview({
  gameId,
  moves: stored,
  orientation,
  opponent,
}: {
  gameId: string;
  moves: readonly GameMove[];
  orientation: BoardOrientation;
  opponent: string;
}) {
  const moves = reviewGame(stored);
  const { record } = useProgress();
  const clean = !stored.some((move) => move.isPlayerMove && move.isBlunder);
  const [step, setStep] = useState(() => firstStep(moves));
  const listRef = useRef<HTMLOListElement>(null);
  const headingId = useId();
  const total = moves.length;
  const current = step > 0 ? moves[step - 1] : undefined;
  const playerWhite = orientation === "white";

  const hasMoves = stored.length > 0;
  useEffect(() => {
    // GAM-02/03: the API gives review XP (and Clean game) only the first time, so a repeat is harmless.
    if (hasMoves) {
      void record(`me/activity/review/${gameId}/${clean ? "clean" : "blunders"}`);
    }
  }, [gameId, clean, hasMoves, record]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: "nearest" });
  }, [step]);

  if (total === 0) {
    return null;
  }

  function go(next: number, focusList = false) {
    const target = Math.max(0, Math.min(total, next));
    const move = moves[target - 1];
    if (target === step + 1 && move) {
      playBoardSound(moveSoundKind(move.fenBefore, move.uci, move.san));
    }
    setStep(target);
    if (focusList) {
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-step="${target}"]`)?.focus());
    }
  }

  function onKey(event: KeyboardEvent<HTMLElement>) {
    const inList = event.target instanceof Element && listRef.current?.contains(event.target) === true;
    const next =
      event.key === "ArrowRight" ? step + 1 : event.key === "ArrowLeft" ? step - 1 : event.key === "Home" ? 0 : event.key === "End" ? total : null;
    if (next === null) {
      return;
    }
    event.preventDefault();
    go(next, inList);
  }

  const mine = sideAccuracy(moves, playerWhite);
  const theirs = sideAccuracy(moves, !playerWhite);
  const counts = verdictCounts(moves, playerWhite);
  const moments = keyMoments(moves);
  const longest = longestThink(moves);
  const myColor = playerWhite ? "White" : "Black";
  const theirColor = playerWhite ? "Black" : "White";

  return (
    <section className={styles.review} aria-labelledby={headingId} onKeyDown={onKey}>
      <h4 id={headingId}>{messages.gameReviewHeading}</h4>

      <div className={styles.summary}>
        <AccuracyCard label={fill(messages.gameReviewYou, { color: myColor })} value={mine} />
        <AccuracyCard label={fill(messages.gameReviewThem, { name: opponent, color: theirColor })} value={theirs} />
        <div className={styles.counts}>
          <p className={styles.countsLabel}>{messages.gameReviewCounts}</p>
          <ul>
            {VERDICTS.map((verdict) => (
              <li key={verdict} className={styles[verdict]}>
                <VerdictIcon verdict={verdict} />
                <span>{VERDICT_TEXT[verdict]}</span>
                <strong>{counts[verdict]}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className={styles.sentence}>{accuracySentence(mine)}</p>

      <div className={styles.stage}>
        <div className={styles.board}>
          <ReviewBoard
            fen={current ? current.fenBefore : (moves[0]?.fenBefore ?? "")}
            travelUci={current?.uci}
            orientation={orientation}
            arrows={current ? arrowsFor(current) : []}
            label={current ? fill(messages.gameReviewBoard, { number: moveNumber(current), san: current.san }) : messages.gameReviewBoardStart}
          />
        </div>
        <div className={styles.side}>
          <div className={styles.detail} aria-live="polite">
            {current ? <MoveDetail move={current} /> : <p>{messages.gameReviewStart}</p>}
          </div>
          <div className={styles.controls}>
            <Button variant="secondary" onClick={() => go(0)} disabled={step === 0} aria-label={messages.gameReviewFirst}>
              <ChevronsLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <Button variant="secondary" onClick={() => go(step - 1)} disabled={step === 0} aria-label={messages.reviewPrevious}>
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <p className={styles.position}>{fill(messages.gameReviewStep, { n: step, total })}</p>
            <Button variant="secondary" onClick={() => go(step + 1)} disabled={step === total} aria-label={messages.reviewNext}>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <Button variant="secondary" onClick={() => go(total)} disabled={step === total} aria-label={messages.gameReviewLast}>
              <ChevronsRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
          <p className={styles.hint}>{messages.gameReviewKeys}</p>
          <h5 className={styles.subhead}>{messages.gameReviewMoves}</h5>
          <ol ref={listRef} className={styles.moves}>
            {pairs(moves).map(([white, black], index) => (
              <li key={index}>
                <span className={styles.number}>{index + 1}.</span>
                {[white, black].map((move) =>
                  move ? (
                    <button
                      key={move.ply}
                      type="button"
                      data-step={move.ply}
                      tabIndex={step === move.ply || (step === 0 && move.ply === 1) ? 0 : -1}
                      aria-current={step === move.ply ? "step" : undefined}
                      aria-label={moveAria(move)}
                      className={`${styles.move} ${styles[move.verdict]}`}
                      onClick={() => go(move.ply)}
                    >
                      {move.san}
                      <span aria-hidden="true">{VERDICT_SYMBOL[move.verdict]}</span>
                    </button>
                  ) : (
                    <span key="empty" />
                  ),
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <EvalGraph moves={moves} step={step} onPick={go} />

      <div className={styles.moments}>
        <h5 className={styles.subhead}>{messages.gameReviewMoments}</h5>
        {moments.length === 0 ? (
          <p>{messages.gameReviewNoMoments}</p>
        ) : (
          <ul>
            {moments.map((move) => (
              <li key={move.ply}>
                <button type="button" className={`${styles.moment} ${styles[move.verdict]}`} onClick={() => go(move.ply)}>
                  <VerdictIcon verdict={move.verdict} />
                  {moveNumber(move)} {move.san}
                  <span className={styles.momentVerdict}>{VERDICT_TEXT[move.verdict]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TimeGraph moves={moves} step={step} longest={longest} />
    </section>
  );
}

function AccuracyCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={styles.accuracy}>
      <p className={styles.accuracyLabel}>{label}</p>
      <p className={styles.accuracyValue}>
        {value === null ? messages.gameReviewAccuracyNone : fill(messages.gameReviewAccuracy, { value })}
      </p>
    </div>
  );
}

function VerdictIcon({ verdict }: { verdict: MoveVerdict }) {
  const Icon = VERDICT_ICON[verdict];
  return <Icon size={16} strokeWidth={2} aria-hidden="true" />;
}

function MoveDetail({ move }: { move: ReviewedMove }) {
  const before = Math.round(move.moverIsWhite ? move.whiteBefore : 100 - move.whiteBefore);
  const after = Math.round(move.moverIsWhite ? move.whiteAfter : 100 - move.whiteAfter);
  const chance = move.isPlayerMove ? messages.gameReviewYourChance : messages.gameReviewTheirChance;
  return (
    <>
      <p className={styles.current}>
        {moveNumber(move)} {move.san}
        <span className={`${styles.chip} ${styles[move.verdict]}`}>
          <VerdictIcon verdict={move.verdict} />
          {VERDICT_TEXT[move.verdict]}
        </span>
      </p>
      <p>{fill(chance, { before, after })}</p>
      {move.verdict !== "best" && move.bestSan ? <p>{fill(messages.gameReviewBestWas, { move: move.bestSan })}</p> : null}
      {move.seconds !== null ? <p className={styles.hint}>{fill(messages.gameReviewTook, { seconds: move.seconds })}</p> : null}
    </>
  );
}

function EvalGraph({ moves, step, onPick }: { moves: readonly ReviewedMove[]; step: number; onPick: (step: number) => void }) {
  const points = graphPoints(moves, GRAPH_W).map((point) => ({ x: point.x, y: (point.y / 100) * GRAPH_H }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `0,${GRAPH_H} ${line} ${GRAPH_W},${GRAPH_H}`;
  const at = points[step]?.x ?? 0;

  function pick(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width > 0) {
      onPick(Math.round(((event.clientX - rect.left) / rect.width) * moves.length));
    }
  }

  return (
    <figure className={styles.graph}>
      <h5 className={styles.subhead}>{messages.gameReviewGraphHeading}</h5>
      <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className={styles.evalSvg} aria-hidden="true" onPointerDown={pick}>
        <rect width={GRAPH_W} height={GRAPH_H} className={styles.blackArea} />
        <polygon points={area} className={styles.whiteArea} />
        <line x1={0} x2={GRAPH_W} y1={GRAPH_H / 2} y2={GRAPH_H / 2} className={styles.midline} />
        <line x1={at} x2={at} y1={0} y2={GRAPH_H} className={styles.cursor} />
        {moves.map((move, index) => {
          const point = points[index + 1];
          if (!point || (move.verdict !== "mistake" && move.verdict !== "blunder")) {
            return null;
          }
          return move.verdict === "blunder" ? (
            <polygon
              key={move.ply}
              className={styles.blunderMark}
              points={`${point.x},${point.y - 7} ${point.x - 6},${point.y + 5} ${point.x + 6},${point.y + 5}`}
            />
          ) : (
            <circle key={move.ply} className={styles.mistakeMark} cx={point.x} cy={point.y} r={5} />
          );
        })}
      </svg>
      <figcaption className={styles.hint}>{messages.gameReviewGraphNote}</figcaption>
    </figure>
  );
}

function TimeGraph({ moves, step, longest }: { moves: readonly ReviewedMove[]; step: number; longest: ReviewedMove | null }) {
  const timed = moves.filter((move) => move.isPlayerMove && move.seconds !== null);
  if (timed.length === 0 || !longest) {
    return <p className={styles.hint}>{messages.gameReviewNoClock}</p>;
  }
  const peak = Math.max(1, ...timed.map((move) => move.seconds ?? 0));
  const width = GRAPH_W / timed.length;
  return (
    <figure className={styles.graph}>
      <h5 className={styles.subhead}>{messages.gameReviewTimeHeading}</h5>
      <svg viewBox={`0 0 ${GRAPH_W} ${TIME_H}`} className={styles.timeSvg} aria-hidden="true">
        {timed.map((move, index) => {
          const height = Math.max(2, ((move.seconds ?? 0) / peak) * (TIME_H - 4));
          const tone = move.ply === step ? styles.barCurrent : move.verdict === "blunder" || move.verdict === "mistake" ? styles[`bar_${move.verdict}`] : styles.bar;
          return (
            <rect
              key={move.ply}
              className={tone}
              x={index * width + width * 0.15}
              width={Math.max(1, width * 0.7)}
              y={TIME_H - height}
              height={height}
            />
          );
        })}
      </svg>
      <figcaption>
        <span className={styles.hint}>{messages.gameReviewTimeNote} </span>
        {fill(messages.gameReviewLongest, {
          seconds: longest.seconds ?? 0,
          number: moveNumber(longest),
          san: longest.san,
          verdict: VERDICT_TEXT[longest.verdict].toLowerCase(),
        })}
      </figcaption>
    </figure>
  );
}

function pairs(moves: readonly ReviewedMove[]): [ReviewedMove | undefined, ReviewedMove | undefined][] {
  const rows: [ReviewedMove | undefined, ReviewedMove | undefined][] = [];
  for (const move of moves) {
    const row = Math.ceil(move.ply / 2) - 1;
    rows[row] ??= [undefined, undefined];
    const entry = rows[row];
    if (entry) {
      entry[move.moverIsWhite ? 0 : 1] = move;
    }
  }
  return rows.map((row) => row ?? [undefined, undefined]);
}

function moveAria(move: ReviewedMove): string {
  const text = fill(messages.gameReviewMoveLabel, {
    number: moveNumber(move),
    san: move.san,
    verdict: VERDICT_TEXT[move.verdict].toLowerCase(),
  });
  return move.seconds === null ? text : text + fill(messages.gameReviewMoveSeconds, { seconds: move.seconds });
}

function arrowsFor(move: ReviewedMove): { uci: string; tone: "blunder" | "best" }[] {
  if (move.verdict === "best" || move.verdict === "good" || !move.bestUci || move.bestUci === move.uci) {
    return [];
  }
  return [
    { uci: move.uci, tone: "blunder" },
    { uci: move.bestUci, tone: "best" },
  ];
}

function accuracySentence(value: number | null): string {
  if (value === null) {
    return "";
  }
  if (value >= 85) {
    return messages.gameReviewAccuracyHigh;
  }
  return value >= 65 ? messages.gameReviewAccuracyMid : messages.gameReviewAccuracyLow;
}
