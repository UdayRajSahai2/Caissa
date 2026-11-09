/**
 * REV-01..05: a full game review from the moves the API stores (ANA-07). Pure maths, no engine.
 * Win chance and accuracy use the published Lichess formulas, so the numbers can be checked.
 */

export type GameMove = {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  bestUci: string;
  bestSan: string;
  evalCp: number | null;
  evalMate: number | null;
  clockSeconds: number | null;
  isPlayerMove: boolean;
  isBlunder: boolean;
};

export type MoveVerdict = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type ReviewedMove = GameMove & {
  moverIsWhite: boolean;
  verdict: MoveVerdict;
  /** White's win chance (0 to 100) before and after the move. */
  whiteBefore: number;
  whiteAfter: number;
  /** How many win-chance points the mover gave away (0 or more). */
  drop: number;
  accuracy: number;
  /** Seconds this move took, from the clocks; null when they are missing. */
  seconds: number | null;
};

/** A small first-move edge for White, about what an engine gives the start position. */
const START_CP = 20;

export const VERDICT_SYMBOL: Record<MoveVerdict, string> = {
  best: "!",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

export function readGameMoves(value: unknown): GameMove[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const moves: GameMove[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const raw = item as Record<string, unknown>;
    if (typeof raw.ply !== "number" || typeof raw.san !== "string" || typeof raw.uci !== "string" || typeof raw.fen_before !== "string") {
      continue;
    }
    moves.push({
      ply: raw.ply,
      san: raw.san,
      uci: raw.uci,
      fenBefore: raw.fen_before,
      bestUci: typeof raw.best_uci === "string" ? raw.best_uci : "",
      bestSan: typeof raw.best_san === "string" ? raw.best_san : "",
      evalCp: typeof raw.eval_cp === "number" ? raw.eval_cp : null,
      evalMate: typeof raw.eval_mate === "number" ? raw.eval_mate : null,
      clockSeconds: typeof raw.clock_seconds === "number" ? raw.clock_seconds : null,
      isPlayerMove: raw.is_player_move === true,
      isBlunder: raw.is_blunder === true,
    });
  }
  return moves.sort((left, right) => left.ply - right.ply);
}

/** White's win chance in percent from a centipawn score (Lichess formula). Mate counts as 100 or 0. */
export function winChance(cp: number | null, mate: number | null): number | null {
  if (mate !== null && mate !== 0) {
    return mate > 0 ? 100 : 0;
  }
  if (cp === null) {
    return null;
  }
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** One move's accuracy from the win-chance points it gave away (Lichess formula), 0 to 100. */
export function moveAccuracy(drop: number): number {
  return Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

/** REV-02. The player's own blunders are exactly the ANA-03 tags, so counts match the heatmap. */
export function verdictFor(move: GameMove, drop: number): MoveVerdict {
  if (move.isPlayerMove && move.isBlunder) {
    return "blunder";
  }
  if (move.bestUci && move.bestUci === move.uci) {
    return "best";
  }
  if (drop >= 30 && !move.isPlayerMove) {
    return "blunder";
  }
  if (drop >= 20) {
    return "mistake";
  }
  if (drop >= 10) {
    return "inaccuracy";
  }
  return "good";
}

export function reviewGame(moves: readonly GameMove[]): ReviewedMove[] {
  const reviewed: ReviewedMove[] = [];
  let whiteBefore = winChance(START_CP, null) ?? 50;
  const lastClock: Record<"white" | "black", number | null> = { white: null, black: null };
  for (const move of moves) {
    const moverIsWhite = move.fenBefore.split(" ")[1] !== "b";
    const mated = move.san.endsWith("#");
    const whiteAfter = mated ? (moverIsWhite ? 100 : 0) : (winChance(move.evalCp, move.evalMate) ?? whiteBefore);
    const moverBefore = moverIsWhite ? whiteBefore : 100 - whiteBefore;
    const moverAfter = moverIsWhite ? whiteAfter : 100 - whiteAfter;
    const drop = Math.max(0, moverBefore - moverAfter);
    const side = moverIsWhite ? "white" : "black";
    const previous = lastClock[side];
    const seconds =
      previous !== null && move.clockSeconds !== null ? Math.max(0, previous - move.clockSeconds) : null;
    lastClock[side] = move.clockSeconds;
    reviewed.push({
      ...move,
      moverIsWhite,
      verdict: verdictFor(move, drop),
      whiteBefore,
      whiteAfter,
      drop,
      accuracy: moveAccuracy(drop),
      seconds,
    });
    whiteBefore = whiteAfter;
  }
  return reviewed;
}

/**
 * REV-03: one side's game accuracy, rounded; null when that side has no moves. The average of the
 * mean and the harmonic mean (as Lichess does), so a few big blunders are not hidden by many easy
 * moves in an already lost or won position. Each move counts as at least 1 so one 0 cannot zero it.
 */
export function sideAccuracy(moves: readonly ReviewedMove[], white: boolean): number | null {
  const own = moves.filter((move) => move.moverIsWhite === white).map((move) => Math.max(1, move.accuracy));
  if (own.length === 0) {
    return null;
  }
  const mean = own.reduce((total, value) => total + value, 0) / own.length;
  const harmonic = own.length / own.reduce((total, value) => total + 1 / value, 0);
  return Math.round((mean + harmonic) / 2);
}

export function verdictCounts(moves: readonly ReviewedMove[], white: boolean): Record<MoveVerdict, number> {
  const counts: Record<MoveVerdict, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const move of moves) {
    if (move.moverIsWhite === white) {
      counts[move.verdict] += 1;
    }
  }
  return counts;
}

/** REV-04: the moves worth a look, in game order. */
export function keyMoments(moves: readonly ReviewedMove[]): ReviewedMove[] {
  return moves.filter((move) => move.verdict === "mistake" || move.verdict === "blunder");
}

/** REV-05: the player's longest think, or null without clocks. */
export function longestThink(moves: readonly ReviewedMove[]): ReviewedMove | null {
  let longest: ReviewedMove | null = null;
  for (const move of moves) {
    if (move.isPlayerMove && move.seconds !== null && (longest === null || move.seconds > (longest.seconds ?? 0))) {
      longest = move;
    }
  }
  return longest;
}

/** REV-01: open on the position before the player's first blunder, or at the start. */
export function firstStep(moves: readonly ReviewedMove[]): number {
  const index = moves.findIndex((move) => move.isPlayerMove && move.verdict === "blunder");
  return index < 0 ? 0 : index;
}

/** "12." for White's move, "12..." for Black's. */
export function moveNumber(move: Pick<ReviewedMove, "ply" | "moverIsWhite">): string {
  const number = Math.ceil(move.ply / 2);
  return move.moverIsWhite ? `${number}.` : `${number}...`;
}

/** Points for the evaluation graph polyline, in a 0..width by 0..100 box (White's chance up). */
export function graphPoints(moves: readonly ReviewedMove[], width: number): { x: number; y: number }[] {
  if (moves.length === 0) {
    return [];
  }
  const step = width / moves.length;
  const first = moves[0];
  return [
    { x: 0, y: 100 - (first?.whiteBefore ?? 50) },
    ...moves.map((move, index) => ({ x: step * (index + 1), y: 100 - move.whiteAfter })),
  ];
}
