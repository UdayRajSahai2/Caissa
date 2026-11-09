import { describe, expect, it } from "vitest";
import {
  buildHeat,
  contrastRatio,
  heatFloor,
  heatLegendRanges,
  heatPairsPass,
  heatScale,
  heatStep,
  heatStepIndex,
  HEAT_CP_CAP,
  HEAT_FRAME,
  HEAT_GHOST,
  HEAT_QUIET,
  nextSquareIndex,
  towerLift,
  type HeatModel,
} from "@/lib/heat-board";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LIGHT_CIVIDIS = ["#efd652", "#ada476", "#747272", "#10366c"];
const DARK_CIVIDIS = ["#4d566d", "#817d75", "#b2a874", "#f6dd4c"];

function move(overrides: Partial<ReviewMove> = {}): ReviewMove {
  return {
    san: "e4",
    ply: 1,
    phase: "opening",
    severityCp: 200,
    square: "e4",
    underTimePressure: false,
    fen: START,
    playedUci: "e2e4",
    bestUci: "g1f3",
    bestSan: "Nf3",
    replyUci: "",
    replySan: "",
    gameId: "9",
    ...overrides,
  };
}

describe("heat board", () => {
  it("spreads colored squares across quantile Cividis steps with passing text", () => {
    const values = [4, 8, 12, 20, 28, 36, 44];
    expect(heatFloor(values)).toBeCloseTo(8.8);
    const scale = heatScale(values, "light");
    expect(scale.steps.map((step) => step.bg)).toEqual(LIGHT_CIVIDIS);
    expect(heatStep(8, scale)).toBeNull();
    expect(heatStepIndex(8, scale)).toBeNull();
    expect(heatStep(12, scale)?.bg).toBe("#efd652");
    expect(heatStepIndex(12, scale)).toBe(0);
    expect(heatStep(44, scale)?.bg).toBe("#10366c");
    expect(heatStepIndex(44, scale)).toBe(3);
    const ranges = heatLegendRanges(scale);
    expect(ranges).toHaveLength(4);
    expect(ranges[0]?.low).toBe(Math.ceil(scale.floor));
    expect(ranges[3]?.high).toBe(Math.round(scale.max));
    const dark = heatScale(values, "dark");
    expect(dark.steps.map((step) => step.bg)).toEqual(DARK_CIVIDIS);
    expect(heatStep(44, dark)?.bg).toBe("#f6dd4c");
    const stark = heatScale(values, "light", true);
    expect(stark.steps.map((step) => step.bg)).toEqual(LIGHT_CIVIDIS.slice(1));
    expect(heatPairsPass()).toBe(true);
    expect(contrastRatio(HEAT_GHOST, HEAT_QUIET.light[0])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(HEAT_GHOST, HEAT_QUIET.light[1])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(HEAT_QUIET.light[0], HEAT_FRAME)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(HEAT_QUIET.light[1], HEAT_FRAME)).toBeGreaterThanOrEqual(3);
  });

  it("names the squares, piece, and phase that cost the most", () => {
    const model = buildHeat(
      [
        move({ playedUci: "g1f3", san: "Nf3", square: "f3", phase: "middlegame", severityCp: 400 }),
        move({ ply: 21, playedUci: "d2f3", san: "Ndf3", square: "f3", phase: "middlegame", severityCp: 300 }),
        move({ ply: 23, playedUci: "d2d5", san: "Nd5", square: "d5", phase: "middlegame", severityCp: 350 }),
        move({ ply: 5, playedUci: "e2e4", san: "e4", square: "e4", phase: "opening", severityCp: 160 }),
      ],
      "all",
      "count",
    );
    expect(model.takeaway).toBe("You lose most material on f3 and d5, mostly with knights in the middlegame.");
    expect(model.ranked.slice(0, 3).map((cell) => cell.square)).toEqual(["f3", "d5", "e4"]);
    expect(model.phases.find((phase) => phase.id === "middlegame")?.share).toBe(75);
  });

  it("keeps white and black blunders apart and caps a mate", () => {
    const model = buildHeat(
      [
        move(),
        move({ ply: 2, playedUci: "e7e5", san: "e5", square: "e5", severityCp: 100_000 }),
      ],
      "black",
      "cp",
    );
    expect(model.totalCount).toBe(1);
    expect(model.bySquare.e5?.cpLoss).toBe(HEAT_CP_CAP);
    expect(model.bySquare.e4).toBeUndefined();
    expect(model.bySquare.e5?.moves[0]?.mate).toBe(true);
  });

  it("says nothing when the filter matches no blunders", () => {
    const model: HeatModel = buildHeat([move()], "black", "count");
    expect(model.takeaway).toBe("");
    expect(model.max).toBe(0);
    expect(model.floor).toBe(0);
    expect(model.ranked).toEqual([]);
  });
});

describe("heatmap keyboard movement", () => {
  it("moves one square per arrow and stops at the board edge", () => {
    expect(nextSquareIndex(0, "ArrowRight")).toBe(1);
    expect(nextSquareIndex(0, "ArrowLeft")).toBe(0);
    expect(nextSquareIndex(0, "ArrowUp")).toBe(0);
    expect(nextSquareIndex(0, "ArrowDown")).toBe(8);
    expect(nextSquareIndex(7, "ArrowRight")).toBe(7);
    expect(nextSquareIndex(63, "ArrowDown")).toBe(63);
    expect(nextSquareIndex(63, "ArrowUp")).toBe(55);
  });

  it("jumps to the ends of the current rank with Home and End", () => {
    expect(nextSquareIndex(20, "Home")).toBe(16);
    expect(nextSquareIndex(20, "End")).toBe(23);
  });

  it("ignores keys that are not part of the board model", () => {
    expect(nextSquareIndex(20, "Tab")).toBeNull();
    expect(nextSquareIndex(20, "Enter")).toBeNull();
  });
});

describe("skyline tower height", () => {
  it("is flat for quiet squares and an empty board", () => {
    expect(towerLift(0, 10)).toBe(0);
    expect(towerLift(5, 0)).toBe(0);
  });

  it("scales linearly to the tallest square", () => {
    expect(towerLift(10, 10)).toBe(1);
    expect(towerLift(5, 10)).toBe(0.5);
  });

  it("keeps the smallest colored square visibly raised and never exceeds full height", () => {
    expect(towerLift(1, 1000)).toBe(0.06);
    expect(towerLift(20, 10)).toBe(1);
  });
});
