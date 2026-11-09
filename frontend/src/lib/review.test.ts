import { describe, expect, it } from "vitest";
import { squareCenter } from "@/lib/chess-board";
import {
  heatmap,
  heatmapSentence,
  isBestAttempt,
  puzzlesFor,
  readReviewMoves,
  weakestPoints,
  weakestSentence,
  type ReviewMove,
} from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove> = {}): ReviewMove {
  return {
    san: "e4",
    ply: 1,
    phase: "opening",
    severityCp: 100,
    square: "e4",
    underTimePressure: false,
    fen: START,
    playedUci: "e2e4",
    bestUci: "g1f3",
    bestSan: "Nf3",
    replyUci: "",
    replySan: "",
    gameId: "",
    ...overrides,
  };
}

describe("review", () => {
  it("counts the square the blunder landed on", () => {
    const counts = heatmap([
      move({ playedUci: "d1h5", square: "e4" }),
      move({ ply: 2, playedUci: "", square: "e4" }),
      move({ ply: 3, playedUci: "d1h5" }),
    ]);
    expect(counts).toEqual({ h5: 2, e4: 1 });
    expect(heatmapSentence(counts)).toBe("h5 is the busiest square, with 2 blunders.");
  });

  it("says the blunders were spread when every square is different", () => {
    expect(heatmapSentence(heatmap([move(), move({ ply: 3, playedUci: "d1h5", square: "h5" })]))).toBe(
      "The blunders landed on different squares.",
    );
  });

  it("names every phase tied for the most centipawns, and the clock when it ties", () => {
    const tied = weakestPoints([
      move({ phase: "opening", severityCp: 400 }),
      move({ ply: 40, phase: "endgame", severityCp: 400, underTimePressure: true }),
    ]);
    expect(tied.map((point) => point.id)).toEqual(["opening", "endgame", "clock"]);
    expect(weakestSentence(tied)).toBe("The weakest points are the opening, the endgame and the clock.");
  });

  it("keeps a smaller clock out of the weakest points", () => {
    const points = weakestPoints([
      move({ phase: "middlegame", severityCp: 400 }),
      move({ ply: 3, phase: "opening", severityCp: 100, underTimePressure: true }),
    ]);
    expect(points.map((point) => point.label)).toEqual(["the middlegame"]);
    expect(weakestSentence(points)).toBe("The weakest point is the middlegame.");
  });

  it("gives one puzzle for each weakest point that has a better move", () => {
    const opening = move();
    const endgame = move({ ply: 40, phase: "endgame", playedUci: "a1d1", bestUci: "a1h1", bestSan: "Rh1" });
    const puzzles = puzzlesFor([opening, endgame], weakestPoints([opening, endgame]));
    expect(puzzles.map((puzzle) => puzzle.ply)).toEqual([1, 40]);
  });

  it("skips a puzzle when the better move was not stored", () => {
    const missed = move({ bestUci: "", bestSan: "" });
    expect(puzzlesFor([missed], weakestPoints([missed]))).toEqual([]);
  });

  it("accepts the saved move and rejects a different square", () => {
    expect(isBestAttempt("g1", "f3", "g1f3")).toBe(true);
    expect(isBestAttempt("e2", "e4", "g1f3")).toBe(false);
    expect(isBestAttempt("g1", "g1", "g1f3")).toBe(false);
  });

  it("drops a blunder that has no move and fills fields the server left out", () => {
    const moves = readReviewMoves([{ san: "e4", ply: 1 }, { san: 1 }, null]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ san: "e4", fen: "", playedUci: "", bestUci: "" });
  });

  it("puts black's near side at the bottom", () => {
    expect(squareCenter("a1", "white")).toEqual({ x: 0.5, y: 7.5 });
    expect(squareCenter("a1", "black")).toEqual({ x: 7.5, y: 0.5 });
    expect(squareCenter("nope", "white")).toBeNull();
  });
});
