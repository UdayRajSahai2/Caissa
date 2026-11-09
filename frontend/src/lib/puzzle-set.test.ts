import { describe, expect, it } from "vitest";
import { buildPuzzleSet, learnedCount, PUZZLE_LIMIT } from "@/lib/puzzle-set";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove>): ReviewMove {
  return {
    san: "e4",
    ply: 1,
    phase: "middlegame",
    severityCp: 200,
    square: "e4",
    underTimePressure: false,
    fen: START,
    playedUci: "e2e4",
    bestUci: "g1f3",
    bestSan: "Nf3",
    replyUci: "",
    replySan: "",
    gameId: "1",
    ...overrides,
  };
}

describe("puzzle set", () => {
  it("puts the weakest phase first, then the rest", () => {
    const set = buildPuzzleSet(
      [
        move({ phase: "opening", gameId: "1", severityCp: 900 }),
        move({ phase: "middlegame", gameId: "2", severityCp: 200 }),
        move({ phase: "middlegame", gameId: "3", severityCp: 300 }),
      ],
      "weakest",
    );
    expect(set.map((puzzle) => puzzle.gameId)).toEqual(["3", "2", "1"]);
  });

  it("takes one puzzle per game before a second from the same game", () => {
    const set = buildPuzzleSet(
      [
        move({ gameId: "1", ply: 21, severityCp: 900 }),
        move({ gameId: "1", ply: 31, severityCp: 800 }),
        move({ gameId: "2", ply: 25, severityCp: 300 }),
      ],
      "middlegame",
    );
    expect(set.map((puzzle) => `${puzzle.gameId}:${puzzle.ply}`)).toEqual(["1:21", "2:25", "1:31"]);
  });

  it("keeps only the chosen phase and skips blunders without a saved better move", () => {
    const set = buildPuzzleSet(
      [
        move({ phase: "endgame", gameId: "1" }),
        move({ phase: "endgame", gameId: "2", bestUci: "" }),
        move({ phase: "endgame", gameId: "3", fen: "" }),
        move({ phase: "opening", gameId: "4" }),
      ],
      "endgame",
    );
    expect(set.map((puzzle) => puzzle.gameId)).toEqual(["1"]);
  });

  it("stops at the puzzle limit", () => {
    const many = Array.from({ length: 40 }, (_, index) => move({ gameId: String(index), severityCp: 150 + index }));
    expect(buildPuzzleSet(many, "weakest")).toHaveLength(PUZZLE_LIMIT);
  });

  it("is empty when nothing can be practised", () => {
    expect(buildPuzzleSet([], "weakest")).toEqual([]);
  });

  it("puts due puzzles first, then new, then later, and drops learned ones (PUZ-06)", () => {
    const moves = [
      move({ gameId: "1", severityCp: 900 }),
      move({ gameId: "2", severityCp: 800 }),
      move({ gameId: "3", severityCp: 700 }),
      move({ gameId: "4", severityCp: 600 }),
    ];
    const schedule = new Map([
      ["1-1", "later" as const],
      ["2-1", "learned" as const],
      ["4-1", "due" as const],
    ]);
    expect(buildPuzzleSet(moves, "weakest", schedule).map((puzzle) => puzzle.gameId)).toEqual(["4", "3", "1"]);
    expect(learnedCount(moves, "weakest", schedule)).toBe(1);
    expect(buildPuzzleSet(moves, "weakest").map((puzzle) => puzzle.gameId)).toEqual(["1", "2", "3", "4"]);
  });
});
