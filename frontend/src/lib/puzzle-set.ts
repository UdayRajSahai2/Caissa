import { puzzleRef, type ScheduleState } from "@/lib/progress";
import { canPractice, type ReviewMove } from "@/lib/review";
import { buildWeaknessReport, REPORT_PHASES, type ReportPhase } from "@/lib/weakness-report";

/** PUZ-03 asks for 10 to 15 puzzles per report. */
export const PUZZLE_LIMIT = 15;

export type PuzzleFocus = "weakest" | ReportPhase;

export const PUZZLE_FOCUSES: readonly PuzzleFocus[] = ["weakest", ...REPORT_PHASES];

/**
 * Puzzles from the player's own blunders (PUZ-01) that have a saved better move.
 * "weakest" puts the phase with the most blunders first; a phase focus keeps only that phase.
 * Within that, one puzzle per game comes before a second from the same game, then the costliest first.
 * With a review schedule (PUZ-06), due puzzles come first, then new ones, then ones coming back later;
 * learned puzzles leave the set.
 */
export function buildPuzzleSet(
  moves: readonly ReviewMove[],
  focus: PuzzleFocus,
  schedule?: ReadonlyMap<string, ScheduleState>,
): ReviewMove[] {
  const ordered = orderedPuzzles(moves, focus);
  if (!schedule) {
    return ordered.slice(0, PUZZLE_LIMIT);
  }
  const rank = (move: ReviewMove) => GROUP[schedule.get(puzzleRef(move)) ?? "new"];
  return ordered
    .filter((move) => schedule.get(puzzleRef(move)) !== "learned")
    .map((move, index) => ({ move, index }))
    .sort((left, right) => rank(left.move) - rank(right.move) || left.index - right.index)
    .map((entry) => entry.move)
    .slice(0, PUZZLE_LIMIT);
}

const GROUP: Record<ScheduleState | "new", number> = { due: 0, new: 1, later: 2, learned: 3 };

function orderedPuzzles(moves: readonly ReviewMove[], focus: PuzzleFocus): ReviewMove[] {
  const ready = moves.filter(canPractice);
  if (focus !== "weakest") {
    return spreadAcrossGames(ready.filter((move) => phaseOf(move) === focus));
  }
  const weakest = buildWeaknessReport(moves, 0).worstPhase?.id;
  const first = spreadAcrossGames(ready.filter((move) => phaseOf(move) === weakest));
  const rest = spreadAcrossGames(ready.filter((move) => phaseOf(move) !== weakest));
  return [...first, ...rest];
}

/** Puzzles in this focus that the schedule marks learned (PUZ-06). */
export function learnedCount(moves: readonly ReviewMove[], focus: PuzzleFocus, schedule: ReadonlyMap<string, ScheduleState>): number {
  return orderedPuzzles(moves, focus).filter((move) => schedule.get(puzzleRef(move)) === "learned").length;
}

export function puzzleCount(moves: readonly ReviewMove[], focus: PuzzleFocus): number {
  return buildPuzzleSet(moves, focus).length;
}

export function puzzleKey(move: ReviewMove): string {
  return `${move.gameId}:${move.ply}`;
}

function phaseOf(move: ReviewMove): string {
  return move.phase || "opening";
}

function spreadAcrossGames(moves: readonly ReviewMove[]): ReviewMove[] {
  const sorted = [...moves].sort((left, right) => right.severityCp - left.severityCp || left.ply - right.ply);
  const seen = new Set<string>();
  const firsts: ReviewMove[] = [];
  const repeats: ReviewMove[] = [];
  for (const move of sorted) {
    if (seen.has(move.gameId)) {
      repeats.push(move);
    } else {
      seen.add(move.gameId);
      firsts.push(move);
    }
  }
  return [...firsts, ...repeats];
}
