import { HEAT_MATE_CP, pieceOf, type HeatPiece } from "@/lib/heat-board";
import { betterMoveLabel, destination, moveLabel, type ReviewMove } from "@/lib/review";

/** A blunder this large (5 pawns) or an allowed mate usually throws away the game. */
export const BIG_SWING_CP = 500;
/** At or above this share of blunders, the clock is called out as a cause. */
export const CLOCK_SHARE_ALERT = 25;
export const COSTLIEST_COUNT = 5;

export const REPORT_PHASES = ["opening", "middlegame", "endgame"] as const;
export type ReportPhase = (typeof REPORT_PHASES)[number];

export type PhaseRow = {
  id: ReportPhase;
  count: number;
  share: number;
  averageCp: number | null;
  underPressure: number;
};

export type CostlyMove = {
  key: string;
  label: string;
  gameId: string;
  severityCp: number;
  mate: boolean;
  better: string;
  underTimePressure: boolean;
};

export type WeaknessReport = {
  blunders: number;
  games: number;
  perGame: number;
  phases: PhaseRow[];
  worstPhase: PhaseRow | null;
  underPressure: number;
  pressureShare: number;
  piece: { id: HeatPiece; share: number } | null;
  square: { id: string; count: number } | null;
  bigSwings: number;
  costliest: CostlyMove[];
};

/** Aggregates stored blunders into the numbers behind each insight (WRP-01). Pure, so it is cheap to test. */
export function buildWeaknessReport(moves: readonly ReviewMove[], games: number): WeaknessReport {
  const blunders = moves.length;
  const phases = REPORT_PHASES.map((id) => phaseRow(id, moves, blunders));
  const underPressure = moves.filter((move) => move.underTimePressure).length;
  return {
    blunders,
    games,
    perGame: games > 0 ? Math.round((blunders / games) * 10) / 10 : 0,
    phases,
    worstPhase: worstPhase(phases),
    underPressure,
    pressureShare: percent(underPressure, blunders),
    piece: topPiece(moves),
    square: topSquare(moves),
    bigSwings: moves.filter((move) => move.severityCp >= BIG_SWING_CP).length,
    costliest: [...moves]
      .sort((left, right) => right.severityCp - left.severityCp || left.ply - right.ply)
      .slice(0, COSTLIEST_COUNT)
      .map((move) => ({
        key: `${move.gameId}:${move.ply}`,
        label: moveLabel(move.ply, move.san),
        gameId: move.gameId,
        severityCp: move.severityCp,
        mate: move.severityCp >= HEAT_MATE_CP,
        better: betterMoveLabel(move),
        underTimePressure: move.underTimePressure,
      })),
  };
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function phaseRow(id: ReportPhase, moves: readonly ReviewMove[], total: number): PhaseRow {
  const inPhase = moves.filter((move) => (move.phase || "opening") === id);
  const rated = inPhase.filter((move) => move.severityCp < HEAT_MATE_CP);
  return {
    id,
    count: inPhase.length,
    share: percent(inPhase.length, total),
    averageCp:
      rated.length > 0 ? Math.round(rated.reduce((sum, move) => sum + move.severityCp, 0) / rated.length) : null,
    underPressure: inPhase.filter((move) => move.underTimePressure).length,
  };
}

/** Most blunders wins; a tie goes to the earlier phase, which is the one to fix first. */
function worstPhase(phases: readonly PhaseRow[]): PhaseRow | null {
  let worst: PhaseRow | null = null;
  for (const row of phases) {
    if (row.count > 0 && (worst === null || row.count > worst.count)) {
      worst = row;
    }
  }
  return worst;
}

function topPiece(moves: readonly ReviewMove[]): { id: HeatPiece; share: number } | null {
  const counts = new Map<HeatPiece, number>();
  for (const move of moves) {
    const piece = pieceOf(move.san);
    counts.set(piece, (counts.get(piece) ?? 0) + 1);
  }
  let best: { id: HeatPiece; count: number } | null = null;
  for (const [id, count] of counts) {
    if (best === null || count > best.count) {
      best = { id, count };
    }
  }
  return best ? { id: best.id, share: percent(best.count, moves.length) } : null;
}

function topSquare(moves: readonly ReviewMove[]): { id: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const move of moves) {
    const square = destination(move);
    if (square) {
      counts.set(square, (counts.get(square) ?? 0) + 1);
    }
  }
  let best: { id: string; count: number } | null = null;
  for (const [id, count] of counts) {
    if (best === null || count > best.count || (count === best.count && id < best.id)) {
      best = { id, count };
    }
  }
  return best;
}
