import { color } from "d3-color";
import { interpolateCividis } from "d3-scale-chromatic";
import { moveLabel, type ReviewMove } from "@/lib/review";

/** A mate is stored as a huge centipawn loss. Cap it so one mate does not paint the whole board. */
export const HEAT_CP_CAP = 1000;
export const HEAT_MATE_CP = 10_000;
export const HEAT_TOP_NUMBERS = 8;
/** How many of the hottest squares the side panel lists. */
export const HEAT_TOP_SQUARES = 3;
export const HEAT_STAGGER_MS = 8;
const SECOND_SQUARE_RATIO = 0.5;
/** Squares below this share of the distribution stay on the neutral tile. */
const HEAT_FLOOR_QUANTILE = 0.2;
const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;
const INK = "#0b1220";
const PAPER = "#ffffff";
/** Cividis sample positions: dark theme rises toward yellow; light theme falls toward navy. */
const DARK_STOPS = [0.3, 0.51, 0.72, 0.95] as const;
const LIGHT_STOPS = [0.92, 0.7, 0.45, 0.12] as const;

export type HeatStep = {
  bg: string;
  fg: string;
};

/** Cividis sequential ramp (blue → grey → yellow). No green/red so brand roles stay intact. */
const LIGHT_STEPS: readonly HeatStep[] = buildCividisSteps(LIGHT_STOPS);
const DARK_STEPS: readonly HeatStep[] = buildCividisSteps(DARK_STOPS);

export const HEAT_QUIET = {
  light: ["#e4e8ee", "#dbe0e8"],
  dark: ["#1a2230", "#161d29"],
} as const;

export const HEAT_FRAME = "#14213a";
/** Ghost piece ink on quiet light tiles. */
export const HEAT_GHOST = "#5b6b82";

export type HeatTheme = "light" | "dark";

export type HeatScale = {
  floor: number;
  max: number;
  cuts: number[];
  steps: readonly HeatStep[];
};

export type HeatMetric = "count" | "cp";
export type HeatColor = "all" | "white" | "black";
export type HeatPiece = "p" | "n" | "b" | "r" | "q" | "k";

export type HeatMove = {
  gameId: string;
  ply: number;
  label: string;
  phase: string;
  severityCp: number;
  mate: boolean;
};

export type SquareHeat = {
  square: string;
  count: number;
  cpLoss: number;
  mates: number;
  moves: HeatMove[];
};

export type PhaseBar = {
  id: "opening" | "middlegame" | "endgame";
  value: number;
  share: number;
};

export type HeatModel = {
  bySquare: Record<string, SquareHeat>;
  ranked: SquareHeat[];
  totalCount: number;
  totalCp: number;
  max: number;
  min: number;
  /** Values below this stay on the quiet tile. The ramp runs from here to max. */
  floor: number;
  phases: PhaseBar[];
  takeaway: string;
};

const PHASES = ["opening", "middlegame", "endgame"] as const;
const PIECE_NAME: Record<HeatPiece, string> = {
  p: "pawns",
  n: "knights",
  b: "bishops",
  r: "rooks",
  q: "queens",
  k: "the king",
};

export function heatFloor(values: readonly number[]): number {
  return quantile(sortedPositive(values), HEAT_FLOOR_QUANTILE);
}

export function heatScale(values: readonly number[], theme: HeatTheme, highContrast = false): HeatScale {
  const sorted = sortedPositive(values);
  const floor = quantile(sorted, HEAT_FLOOR_QUANTILE);
  const max = sorted[sorted.length - 1] ?? 0;
  const palette = theme === "dark" ? DARK_STEPS : LIGHT_STEPS;
  const steps = highContrast ? palette.slice(1) : palette;
  const colored = sorted.filter((value) => value >= floor);
  const count = steps.length;
  const cuts = Array.from({ length: Math.max(count - 1, 0) }, (_, index) => quantile(colored, (index + 1) / count));
  return { floor, max, cuts, steps };
}

export function heatStepIndex(value: number, scale: HeatScale): number | null {
  if (value <= 0 || value < scale.floor || scale.steps.length === 0) {
    return null;
  }
  let index = 0;
  for (const cut of scale.cuts) {
    if (value >= cut) {
      index += 1;
    } else {
      break;
    }
  }
  return Math.min(index, scale.steps.length - 1);
}

export function heatStep(value: number, scale: HeatScale): HeatStep | null {
  const index = heatStepIndex(value, scale);
  return index === null ? null : (scale.steps[index] ?? null);
}

/** Inclusive integer ranges for each colored step, for the legend. */
export function heatLegendRanges(scale: HeatScale): { low: number; high: number }[] {
  const lows: number[] = [Math.ceil(scale.floor)];
  const highs: number[] = [];
  for (let index = 0; index < scale.cuts.length; index += 1) {
    const cut = Math.round(scale.cuts[index] ?? scale.max);
    const low = lows[index] ?? cut;
    highs.push(Math.max(low, cut - 1));
    lows.push(cut);
  }
  highs.push(Math.round(scale.max));
  return scale.steps.map((_, index) => {
    const low = lows[index] ?? Math.ceil(scale.floor);
    const high = Math.max(low, highs[index] ?? Math.round(scale.max));
    return { low, high };
  });
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function heatPairsPass(): boolean {
  for (const theme of ["light", "dark"] as const) {
    const scale = heatScale([1], theme, false);
    for (const step of scale.steps) {
      if (contrastRatio(step.fg, step.bg) < TEXT_CONTRAST) {
        return false;
      }
    }
    if (theme === "light") {
      for (const tile of HEAT_QUIET.light) {
        if (contrastRatio(HEAT_GHOST, tile) < GRAPHIC_CONTRAST) {
          return false;
        }
      }
    }
  }
  return true;
}

function buildCividisSteps(stops: readonly number[]): HeatStep[] {
  return stops.map((stop) => {
    const bg = cividisHex(stop);
    return { bg, fg: labelColor(bg) };
  });
}

function cividisHex(stop: number): string {
  const parsed = color(interpolateCividis(stop));
  if (parsed === null) {
    throw new Error("cividis color missing");
  }
  return parsed.formatHex();
}

function labelColor(background: string): string {
  return contrastRatio(PAPER, background) >= TEXT_CONTRAST ? PAPER : INK;
}

/** Smallest tower height, so the coolest colored square still reads as raised. */
export const TOWER_MIN_LIFT = 0.06;

/** Tower height for the 3D skyline (HMP-06), as a share of the tallest tower. Linear, so heights stay honest. */
export function towerLift(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  return Math.max(TOWER_MIN_LIFT, Math.min(1, value / max));
}

/**
 * Next square index on an 8x8 board in display order (HMP-05).
 * Edges stop rather than wrap, so a screen reader user always knows where the board ends.
 */
export function nextSquareIndex(index: number, key: string): number | null {
  const row = Math.floor(index / 8);
  const column = index % 8;
  switch (key) {
    case "ArrowRight":
      return column < 7 ? index + 1 : index;
    case "ArrowLeft":
      return column > 0 ? index - 1 : index;
    case "ArrowUp":
      return row > 0 ? index - 8 : index;
    case "ArrowDown":
      return row < 7 ? index + 8 : index;
    case "Home":
      return row * 8;
    case "End":
      return row * 8 + 7;
    default:
      return null;
  }
}

export function staggerDelay(row: number, column: number): number {
  return Math.round(Math.hypot(column - 3.5, row - 3.5)) * HEAT_STAGGER_MS;
}

export function squareValue(cell: SquareHeat, metric: HeatMetric): number {
  return metric === "count" ? cell.count : cell.cpLoss;
}

export function buildHeat(moves: readonly ReviewMove[], color: HeatColor, metric: HeatMetric): HeatModel {
  const bySquare: Record<string, SquareHeat> = {};
  const phaseValue = new Map<string, number>();
  const phaseCp = new Map<string, number>();
  const pieceCount = new Map<HeatPiece, number>();
  let totalCount = 0;
  let totalCp = 0;

  for (const move of moves) {
    const square = playedSquare(move);
    if (!square) {
      continue;
    }
    const side = move.ply % 2 === 1 ? "white" : "black";
    if (color !== "all" && side !== color) {
      continue;
    }
    const weight = cappedCp(move.severityCp);
    const cell = bySquare[square] ?? { square, count: 0, cpLoss: 0, mates: 0, moves: [] };
    cell.count += 1;
    cell.cpLoss += weight;
    if (move.severityCp >= HEAT_MATE_CP) {
      cell.mates += 1;
    }
    cell.moves.push({
      gameId: move.gameId,
      ply: move.ply,
      label: moveLabel(move.ply, move.san),
      phase: move.phase,
      severityCp: move.severityCp,
      mate: move.severityCp >= HEAT_MATE_CP,
    });
    bySquare[square] = cell;
    totalCount += 1;
    totalCp += weight;
    const phase = move.phase || "opening";
    phaseValue.set(phase, (phaseValue.get(phase) ?? 0) + (metric === "count" ? 1 : weight));
    phaseCp.set(phase, (phaseCp.get(phase) ?? 0) + weight);
    const piece = pieceOf(move.san);
    pieceCount.set(piece, (pieceCount.get(piece) ?? 0) + 1);
  }

  for (const cell of Object.values(bySquare)) {
    cell.moves.sort((left, right) => right.severityCp - left.severityCp || left.ply - right.ply);
  }
  const ranked = Object.values(bySquare).sort(
    (left, right) => squareValue(right, metric) - squareValue(left, metric) || left.square.localeCompare(right.square),
  );
  const values = ranked.map((cell) => squareValue(cell, metric));
  const max = values.length > 0 ? Math.max(...values) : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const floor = heatFloor(values);
  const phaseTotal = [...phaseValue.values()].reduce((sum, value) => sum + value, 0);
  const phases = PHASES.map((id) => {
    const value = phaseValue.get(id) ?? 0;
    return { id, value, share: phaseTotal === 0 ? 0 : Math.round((value / phaseTotal) * 100) };
  });

  return {
    bySquare,
    ranked,
    totalCount,
    totalCp,
    max,
    min,
    floor,
    phases,
    takeaway: takeaway(ranked, pieceCount, phaseCp),
  };
}

export function averageCp(cell: SquareHeat): number | null {
  const rated = cell.moves.filter((move) => !move.mate);
  if (rated.length === 0) {
    return null;
  }
  const sum = rated.reduce((total, move) => total + move.severityCp, 0);
  return Math.round(sum / rated.length);
}

export function shareOf(cell: SquareHeat, model: HeatModel, metric: HeatMetric): number {
  const total = metric === "count" ? model.totalCount : model.totalCp;
  const value = squareValue(cell, metric);
  if (total <= 0 || value <= 0) {
    return 0;
  }
  const share = Math.round((value / total) * 100);
  return share === 0 ? 1 : share;
}

export function isDarkSquare(square: string): boolean {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 1;
}

function takeaway(
  ranked: readonly SquareHeat[],
  pieces: ReadonlyMap<HeatPiece, number>,
  phases: ReadonlyMap<string, number>,
): string {
  const first = ranked[0];
  if (!first || (first.cpLoss <= 0 && first.count <= 0)) {
    return "";
  }
  const second = ranked[1];
  const lead = first.cpLoss > 0 ? first.cpLoss : first.count;
  const follow = second ? (first.cpLoss > 0 ? second.cpLoss : second.count) : 0;
  const names = second && follow >= lead * SECOND_SQUARE_RATIO ? `${first.square} and ${second.square}` : first.square;
  const piece = dominantPiece(pieces);
  const phase = dominantPhase(phases);
  return `You lose most material on ${names}, mostly with ${PIECE_NAME[piece]} in the ${phase}.`;
}

function dominantPiece(pieces: ReadonlyMap<HeatPiece, number>): HeatPiece {
  let best: HeatPiece = "p";
  let count = -1;
  for (const [piece, value] of pieces) {
    if (value > count) {
      best = piece;
      count = value;
    }
  }
  return best;
}

function dominantPhase(phases: ReadonlyMap<string, number>): string {
  let best = "middlegame";
  let value = -1;
  for (const id of PHASES) {
    const next = phases.get(id) ?? 0;
    if (next > value) {
      best = id;
      value = next;
    }
  }
  return best;
}

function playedSquare(move: ReviewMove): string {
  const to = move.playedUci.slice(2, 4);
  if (/^[a-h][1-8]$/.test(to)) {
    return to;
  }
  return /^[a-h][1-8]$/.test(move.square) ? move.square : "";
}

export function pieceOf(san: string): HeatPiece {
  if (san.startsWith("O-O")) {
    return "k";
  }
  const letter = san[0];
  if (letter === "N") {
    return "n";
  }
  if (letter === "B") {
    return "b";
  }
  if (letter === "R") {
    return "r";
  }
  if (letter === "Q") {
    return "q";
  }
  if (letter === "K") {
    return "k";
  }
  return "p";
}

function cappedCp(cp: number): number {
  if (!Number.isFinite(cp) || cp <= 0) {
    return 0;
  }
  return Math.min(cp, HEAT_CP_CAP);
}

function sortedPositive(values: readonly number[]): number[] {
  return values.filter((value) => value > 0).sort((left, right) => left - right);
}

function quantile(sorted: readonly number[], portion: number): number {
  const count = sorted.length;
  if (count === 0) {
    return 0;
  }
  if (portion <= 0 || count < 2) {
    return sorted[0] ?? 0;
  }
  if (portion >= 1) {
    return sorted[count - 1] ?? 0;
  }
  const position = (count - 1) * portion;
  const index = Math.floor(position);
  const current = sorted[index] ?? 0;
  const next = sorted[index + 1] ?? current;
  return current + (next - current) * (position - index);
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const [red, green, blue] = channels.map(srgbToLinear) as [number, number, number];
  return red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
