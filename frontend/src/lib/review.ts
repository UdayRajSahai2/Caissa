const SQUARE = /^[a-h][1-8]$/;
const PHASE_ORDER = ["opening", "middlegame", "endgame"];

export type ReviewMove = {
  san: string;
  ply: number;
  phase: string;
  severityCp: number;
  square: string;
  underTimePressure: boolean;
  fen: string;
  playedUci: string;
  bestUci: string;
  bestSan: string;
  /** The engine's best reply right after the blunder: how the blunder is punished. Empty when the game ended. */
  replyUci: string;
  replySan: string;
  gameId: string;
};

export type WeakPoint = {
  id: string;
  label: string;
  severity: number;
};

export function readReviewMoves(value: unknown): ReviewMove[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const move = readReviewMove(item);
    return move ? [move] : [];
  });
}

export function moveLabel(ply: number, san: string): string {
  const number = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${number}. ${san}` : `${number}... ${san}`;
}

export function arrowEnds(uci: string): { from: string; to: string } | null {
  if (uci.length < 4) {
    return null;
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!SQUARE.test(from) || !SQUARE.test(to)) {
    return null;
  }
  return { from, to };
}

export function arrowCaption(playedUci: string, bestUci: string): string {
  const played = arrowEnds(playedUci);
  const best = arrowEnds(bestUci);
  const parts: string[] = [];
  if (played) {
    parts.push(`The move you played from ${played.from} to ${played.to}.`);
  }
  if (best && bestUci !== playedUci) {
    parts.push(`The better move from ${best.from} to ${best.to}.`);
  }
  return parts.join(" ");
}

export function betterMoveLabel(move: ReviewMove): string {
  if (move.bestSan) {
    return move.bestSan;
  }
  const ends = arrowEnds(move.bestUci);
  if (!ends) {
    return "";
  }
  return `${ends.from} to ${ends.to}`;
}

export function isBestAttempt(from: string, to: string, bestUci: string): boolean {
  return bestUci.startsWith(`${from}${to}`) && from !== to;
}

export function destination(move: ReviewMove): string {
  const to = move.playedUci.slice(2, 4);
  if (SQUARE.test(to)) {
    return to;
  }
  return SQUARE.test(move.square) ? move.square : "";
}

export function heatmap(moves: readonly ReviewMove[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const move of moves) {
    const square = destination(move);
    if (!square) {
      continue;
    }
    counts[square] = (counts[square] ?? 0) + 1;
  }
  return counts;
}

export function heatLevel(count: number, peak: number): 0 | 1 | 2 | 3 {
  if (count <= 0 || peak <= 0) {
    return 0;
  }
  if (peak === 1) {
    return 1;
  }
  const ratio = count / peak;
  if (ratio > 0.66) {
    return 3;
  }
  if (ratio > 0.33) {
    return 2;
  }
  return 1;
}

export function heatmapSentence(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return "No square was marked.";
  }
  const peak = Math.max(...entries.map(([, count]) => count));
  const hottest = entries.filter(([, count]) => count === peak).map(([square]) => square);
  if (peak === 1) {
    return entries.length === 1
      ? `The blunder landed on ${hottest[0]}.`
      : "The blunders landed on different squares.";
  }
  if (hottest.length === 1) {
    return `${hottest[0]} is the busiest square, with ${peak} blunders.`;
  }
  return `${joinNames(hottest)} are the busiest squares, with ${peak} blunders each.`;
}

export function weakestPoints(moves: readonly ReviewMove[]): WeakPoint[] {
  const phases = new Map<string, number>();
  let clock = 0;
  for (const move of moves) {
    const phase = move.phase || "unknown";
    phases.set(phase, (phases.get(phase) ?? 0) + move.severityCp);
    if (move.underTimePressure) {
      clock += move.severityCp;
    }
  }
  const peak = Math.max(0, ...phases.values());
  if (peak === 0) {
    return [];
  }
  const points: WeakPoint[] = [];
  for (const [phase, severity] of phases) {
    if (severity === peak) {
      points.push({ id: phase, label: phaseLabel(phase), severity });
    }
  }
  points.sort((left, right) => phaseRank(left.id) - phaseRank(right.id));
  if (clock >= peak) {
    points.push({ id: "clock", label: "the clock", severity: clock });
  }
  return points;
}

export function weakestSentence(points: readonly WeakPoint[]): string {
  if (points.length === 0) {
    return "";
  }
  const names = points.map((point) => point.label);
  if (names.length === 1) {
    return `The weakest point is ${names[0]}.`;
  }
  return `The weakest points are ${joinNames(names)}.`;
}

export function puzzlesFor(moves: readonly ReviewMove[], points: readonly WeakPoint[]): ReviewMove[] {
  const chosen: ReviewMove[] = [];
  const seen = new Set<string>();
  for (const point of points) {
    const pool =
      point.id === "clock" ? moves.filter((move) => move.underTimePressure) : moves.filter((move) => move.phase === point.id);
    const puzzle = [...pool]
      .sort((left, right) => right.severityCp - left.severityCp)
      .find((move) => canPractice(move));
    const puzzleKey = puzzle ? `${puzzle.gameId}:${puzzle.ply}` : "";
    if (puzzle && !seen.has(puzzleKey)) {
      seen.add(puzzleKey);
      chosen.push(puzzle);
    }
  }
  return chosen;
}

function readReviewMove(value: unknown): ReviewMove | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (typeof body.san !== "string" || typeof body.ply !== "number" || !Number.isFinite(body.ply)) {
    return null;
  }
  return {
    san: body.san,
    ply: body.ply,
    phase: typeof body.phase === "string" ? body.phase : "",
    severityCp: typeof body.severity_cp === "number" && Number.isFinite(body.severity_cp) ? body.severity_cp : 0,
    square: typeof body.square === "string" ? body.square : "",
    underTimePressure: body.under_time_pressure === true,
    fen: typeof body.fen === "string" ? body.fen : "",
    playedUci: typeof body.played_uci === "string" ? body.played_uci : "",
    bestUci: typeof body.best_uci === "string" ? body.best_uci : "",
    bestSan: typeof body.best_san === "string" ? body.best_san : "",
    replyUci: typeof body.reply_uci === "string" ? body.reply_uci : "",
    replySan: typeof body.reply_san === "string" ? body.reply_san : "",
    gameId: typeof body.game_id === "string" ? body.game_id : "",
  };
}

export function canPractice(move: ReviewMove): boolean {
  return move.fen.length > 0 && arrowEnds(move.bestUci) !== null && move.bestUci !== move.playedUci;
}

function phaseLabel(phase: string): string {
  if (phase === "opening" || phase === "middlegame" || phase === "endgame") {
    return `the ${phase}`;
  }
  return phase;
}

function phaseRank(phase: string): number {
  const index = PHASE_ORDER.indexOf(phase);
  return index === -1 ? PHASE_ORDER.length : index;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
