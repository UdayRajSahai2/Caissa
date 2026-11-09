import { describe, expect, it } from "vitest";
import { masteryByPhase, puzzleRef, rankShare, readProgress, scheduleFor } from "@/lib/progress";
import type { ReviewMove } from "@/lib/review";

const API = {
  xp: 175,
  rank: "Knight",
  rank_xp: 150,
  next_rank: "Bishop",
  next_rank_xp: 400,
  streak: 2,
  best_streak: 5,
  goal: 3,
  today_solved: 1,
  badges: ["first_solve", "made_up"],
  learned_by_phase: { opening: 1, middlegame: 0, endgame: 4 },
  lessons_done: ["knight-forks"],
  reviewed: 3,
  puzzles: [
    { ref: "1-5", state: "learned", due_on: null },
    { ref: "2-9", state: "due", due_on: "2026-11-08" },
    { ref: "3-1", state: "odd", due_on: null },
  ],
  xp_gained: 10,
  new_badges: ["first_solve"],
  new_rank: true,
};

function puzzle(gameId: string, ply: number, phase: string): ReviewMove {
  return {
    san: "e4",
    ply,
    phase,
    severityCp: 200,
    square: "e4",
    underTimePressure: false,
    fen: "",
    playedUci: "e2e4",
    bestUci: "g1f3",
    bestSan: "Nf3",
    replyUci: "",
    replySan: "",
    gameId,
  };
}

describe("progress", () => {
  it("reads the API shape and drops unknown badges and states", () => {
    const progress = readProgress(API);
    expect(progress?.badges).toEqual(["first_solve"]);
    expect(progress?.puzzles.map((item) => item.ref)).toEqual(["1-5", "2-9"]);
    expect(progress?.learnedByPhase.endgame).toBe(4);
    expect(progress?.newRank).toBe(true);
    expect(readProgress({ rank: "Pawn" })).toBeNull();
    expect(readProgress(null)).toBeNull();
  });

  it("works out the share to the next rank", () => {
    const progress = readProgress(API)!;
    expect(rankShare(progress)).toBe(10);
    expect(rankShare({ ...progress, nextRankXp: null })).toBe(100);
  });

  it("measures mastery per phase and marks a fixed pattern only with 3 or more, all learned (GAM-04)", () => {
    const schedule = scheduleFor(readProgress(API));
    expect(puzzleRef(puzzle("1", 5, "opening"))).toBe("1-5");
    const rows = masteryByPhase([puzzle("1", 5, "opening"), puzzle("2", 9, "opening"), puzzle("4", 2, "endgame")], schedule);
    expect(rows).toEqual([
      { phase: "opening", learned: 1, available: 2, fixed: false },
      { phase: "endgame", learned: 0, available: 1, fixed: false },
    ]);
    const all = new Map([
      ["5-1", "learned" as const],
      ["5-2", "learned" as const],
      ["5-3", "learned" as const],
    ]);
    const fixed = masteryByPhase([puzzle("5", 1, "endgame"), puzzle("5", 2, "endgame"), puzzle("5", 3, "endgame")], all);
    expect(fixed[0]?.fixed).toBe(true);
    const many = Array.from({ length: 40 }, (_, index) => puzzle("6", index + 1, "middlegame"));
    const someLearned = new Map(many.slice(0, 15).map((item) => [puzzleRef(item), "learned" as const]));
    expect(masteryByPhase(many, new Map())[0]).toEqual({ phase: "middlegame", learned: 0, available: 15, fixed: false });
    expect(masteryByPhase(many, someLearned)[0]).toEqual({ phase: "middlegame", learned: 15, available: 15, fixed: true });
  });
});
