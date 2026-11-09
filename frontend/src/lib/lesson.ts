import { applyUci } from "@/lib/chess-board";
import { pieceOf, type HeatPiece } from "@/lib/heat-board";
import { arrowEnds, type ReviewMove } from "@/lib/review";
import { buildWeaknessReport, type ReportPhase } from "@/lib/weakness-report";

/** Examples per lesson: enough to see a pattern, short enough to finish. */
export const LESSON_EXAMPLES = 3;

export type Lesson =
  | { id: "phase"; phase: ReportPhase; examples: ReviewMove[] }
  | { id: "clock"; examples: ReviewMove[] }
  | { id: "piece"; piece: HeatPiece; examples: ReviewMove[] };

export type LessonStepKind = "position" | "played" | "reply" | "better";

export type LessonStep = {
  kind: LessonStepKind;
  fen: string;
  travelUci?: string;
  arrow?: { uci: string; tone: "blunder" | "best" };
};

/**
 * Lessons built from the player's own blunders (LSN-01): the weakest phase, the clock, and the
 * piece that goes wrong most. Each keeps the costliest examples that can be replayed.
 */
export function buildLessons(moves: readonly ReviewMove[]): Lesson[] {
  const replayable = [...moves]
    .filter((move) => move.fen && arrowEnds(move.playedUci))
    .sort((left, right) => right.severityCp - left.severityCp || left.ply - right.ply);
  const report = buildWeaknessReport(moves, 0);
  const lessons: Lesson[] = [];
  const phase = report.worstPhase?.id;
  if (phase) {
    const examples = pick(replayable, (move) => (move.phase || "opening") === phase);
    if (examples.length > 0) {
      lessons.push({ id: "phase", phase, examples });
    }
  }
  const clock = pick(replayable, (move) => move.underTimePressure);
  if (clock.length > 0) {
    lessons.push({ id: "clock", examples: clock });
  }
  const piece = report.piece?.id;
  if (piece) {
    const examples = pick(replayable, (move) => pieceOf(move.san) === piece);
    if (examples.length > 0) {
      lessons.push({ id: "piece", piece, examples });
    }
  }
  return lessons;
}

/** The replay of one blunder (LSN-02): the position, the move played, how it was punished, the better move. */
export function lessonSteps(move: ReviewMove): LessonStep[] {
  const steps: LessonStep[] = [
    { kind: "position", fen: move.fen },
    { kind: "played", fen: move.fen, travelUci: move.playedUci, arrow: { uci: move.playedUci, tone: "blunder" } },
  ];
  if (arrowEnds(move.replyUci)) {
    steps.push({ kind: "reply", fen: applyUci(move.fen, move.playedUci), travelUci: move.replyUci });
  }
  if (arrowEnds(move.bestUci) && move.bestUci !== move.playedUci) {
    steps.push({ kind: "better", fen: move.fen, travelUci: move.bestUci, arrow: { uci: move.bestUci, tone: "best" } });
  }
  return steps;
}

function pick(moves: readonly ReviewMove[], keep: (move: ReviewMove) => boolean): ReviewMove[] {
  const seen = new Set<string>();
  const chosen: ReviewMove[] = [];
  for (const move of moves) {
    if (!keep(move) || seen.has(move.gameId)) {
      continue;
    }
    seen.add(move.gameId);
    chosen.push(move);
    if (chosen.length === LESSON_EXAMPLES) {
      break;
    }
  }
  return chosen;
}
