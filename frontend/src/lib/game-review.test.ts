import { describe, expect, it } from "vitest";
import {
  firstStep,
  graphPoints,
  keyMoments,
  longestThink,
  moveAccuracy,
  moveNumber,
  readGameMoves,
  reviewGame,
  sideAccuracy,
  verdictCounts,
  winChance,
  type GameMove,
} from "@/lib/game-review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function move(overrides: Partial<GameMove>): GameMove {
  return {
    ply: 1,
    san: "e4",
    uci: "e2e4",
    fenBefore: START,
    bestUci: "e2e4",
    bestSan: "e4",
    evalCp: 20,
    evalMate: null,
    clockSeconds: null,
    isPlayerMove: true,
    isBlunder: false,
    ...overrides,
  };
}

describe("win chance and accuracy (REV-02, REV-03)", () => {
  it("follows the Lichess curves", () => {
    expect(winChance(0, null)).toBe(50);
    expect(winChance(300, null)).toBeCloseTo(75.15, 1);
    expect(winChance(-300, null)).toBeCloseTo(24.85, 1);
    expect(winChance(null, 3)).toBe(100);
    expect(winChance(null, -2)).toBe(0);
    expect(winChance(null, null)).toBeNull();
    expect(moveAccuracy(0)).toBeCloseTo(100, 3);
    expect(moveAccuracy(10)).toBeCloseTo(63.6, 0);
    expect(moveAccuracy(100)).toBe(0);
  });
});

describe("reviewGame", () => {
  it("labels moves from the mover's drop and keeps the player's blunders exactly as tagged", () => {
    const reviewed = reviewGame([
      move({ ply: 1, evalCp: 30 }),
      move({ ply: 2, san: "f6", uci: "f7f6", fenBefore: AFTER_E4, bestUci: "e7e5", isPlayerMove: false, evalCp: 120 }),
      move({ ply: 3, san: "Qh5", uci: "d1h5", fenBefore: START, bestUci: "d2d4", evalCp: 100 }),
      move({ ply: 4, san: "g5", uci: "g7g5", fenBefore: AFTER_E4, bestUci: "e7e5", isPlayerMove: false, evalMate: 1 }),
      move({ ply: 5, san: "Qxe8#", uci: "h5e8", fenBefore: START, bestUci: "h5e8", evalCp: null }),
    ]);
    expect(reviewed.map((item) => item.verdict)).toEqual(["best", "good", "good", "blunder", "best"]);
    expect(reviewed[3]?.drop).toBeCloseTo(100 - (winChance(100, null) ?? 0), 1);
    expect(reviewed[4]?.whiteAfter).toBe(100);
    const tagged = reviewGame([move({ bestUci: "d2d4", isBlunder: true, evalCp: 0 })]);
    expect(tagged[0]?.verdict).toBe("blunder");
    const untaggedBigDrop = reviewGame([move({ bestUci: "d2d4", evalCp: -400 })]);
    expect(untaggedBigDrop[0]?.verdict).toBe("mistake");
  });

  it("scores accuracy per side and counts verdicts", () => {
    const reviewed = reviewGame([
      move({ ply: 1, evalCp: 20 }),
      move({ ply: 2, fenBefore: AFTER_E4, uci: "a7a6", bestUci: "e7e5", isPlayerMove: false, evalCp: 300 }),
    ]);
    expect(sideAccuracy(reviewed, true)).toBe(100);
    expect(sideAccuracy(reviewed, false)).toBeLessThan(50);
    expect(verdictCounts(reviewed, false).blunder).toBe(0);
    expect(verdictCounts(reviewed, false).mistake).toBe(1);
    expect(sideAccuracy([], true)).toBeNull();
  });

  it("does not let many easy moves hide a blunder in the accuracy (mean and harmonic mean)", () => {
    const easy = Array.from({ length: 9 }, (_, index) => move({ ply: index * 2 + 1, evalCp: 20 }));
    const blunder = move({ ply: 19, bestUci: "d2d4", evalCp: -2000 });
    const reviewed = reviewGame([...easy, blunder]);
    const plainMean = Math.round(reviewed.reduce((total, item) => total + item.accuracy, 0) / reviewed.length);
    expect(plainMean).toBeGreaterThanOrEqual(85);
    expect(sideAccuracy(reviewed, true)).toBeLessThanOrEqual(plainMean - 15);
  });

  it("works out seconds per move from each side's clock, and the longest think", () => {
    const reviewed = reviewGame([
      move({ ply: 1, clockSeconds: 180 }),
      move({ ply: 2, fenBefore: AFTER_E4, uci: "e7e5", isPlayerMove: false, clockSeconds: 178 }),
      move({ ply: 3, clockSeconds: 140 }),
      move({ ply: 4, fenBefore: AFTER_E4, uci: "b8c6", isPlayerMove: false, clockSeconds: 175 }),
      move({ ply: 5, clockSeconds: 150 }),
    ]);
    expect(reviewed.map((item) => item.seconds)).toEqual([null, null, 40, 3, 0]);
    expect(longestThink(reviewed)?.ply).toBe(3);
    expect(longestThink(reviewGame([move({})]))).toBeNull();
  });

  it("opens before the first blunder, lists key moments, and numbers moves", () => {
    const reviewed = reviewGame([
      move({ ply: 1 }),
      move({ ply: 2, fenBefore: AFTER_E4, uci: "e7e5", isPlayerMove: false }),
      move({ ply: 3, bestUci: "g1f3", isBlunder: true, evalCp: -300 }),
    ]);
    expect(firstStep(reviewed)).toBe(2);
    expect(keyMoments(reviewed).map((item) => item.ply)).toEqual([3]);
    expect(moveNumber(reviewed[0]!)).toBe("1.");
    expect(moveNumber(reviewed[1]!)).toBe("1...");
    expect(firstStep(reviewGame([move({})]))).toBe(0);
  });

  it("draws graph points from White's chance, top is White winning", () => {
    const points = graphPoints(reviewGame([move({ evalCp: 0 }), move({ ply: 2, fenBefore: AFTER_E4, evalMate: 2 })]), 100);
    expect(points).toHaveLength(3);
    expect(points[1]).toEqual({ x: 50, y: 50 });
    expect(points[2]).toEqual({ x: 100, y: 0 });
    expect(graphPoints([], 100)).toEqual([]);
  });
});

describe("readGameMoves", () => {
  it("reads the API shape, skips bad rows, and sorts by ply", () => {
    const moves = readGameMoves([
      { ply: 2, san: "e5", uci: "e7e5", fen_before: AFTER_E4, best_uci: "e7e5", best_san: "e5", eval_cp: 15, eval_mate: null, clock_seconds: 170, is_player_move: false, is_blunder: false },
      { ply: 1, san: "e4", uci: "e2e4", fen_before: START, best_uci: "", best_san: "", eval_cp: null, eval_mate: null, clock_seconds: null, is_player_move: true, is_blunder: false },
      { ply: "3" },
      null,
    ]);
    expect(moves.map((item) => item.ply)).toEqual([1, 2]);
    expect(moves[1]?.clockSeconds).toBe(170);
    expect(readGameMoves("nope")).toEqual([]);
  });
});
