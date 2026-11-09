import { describe, expect, it } from "vitest";
import { buildLessons, LESSON_EXAMPLES, lessonSteps } from "@/lib/lesson";
import { lessonCaption, lessonTitle } from "@/lib/lesson-copy";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove>): ReviewMove {
  return {
    san: "Nf3",
    ply: 21,
    phase: "middlegame",
    severityCp: 340,
    square: "f3",
    underTimePressure: false,
    fen: START,
    playedUci: "g1f3",
    bestUci: "e2e4",
    bestSan: "e4",
    replyUci: "e7e5",
    replySan: "e5",
    gameId: "1",
    ...overrides,
  };
}

describe("lessons", () => {
  it("builds a phase, clock, and piece lesson from the player's own blunders", () => {
    const lessons = buildLessons([
      move({ gameId: "1", underTimePressure: true }),
      move({ gameId: "2", ply: 25 }),
      move({ gameId: "3", phase: "opening", san: "e4", playedUci: "e2e4" }),
    ]);
    expect(lessons.map(lessonTitle)).toEqual([
      "Middlegame blunders",
      "Blunders under 30 seconds",
      "Blunders with your knight",
    ]);
    expect(lessons[0]?.examples.map((example) => example.gameId)).toEqual(["1", "2"]);
  });

  it("keeps one example per game and at most three", () => {
    const moves = Array.from({ length: 6 }, (_, index) => move({ gameId: String(index % 4), ply: 21 + index }));
    const [phase] = buildLessons(moves);
    expect(phase?.examples).toHaveLength(LESSON_EXAMPLES);
    expect(new Set(phase?.examples.map((example) => example.gameId)).size).toBe(LESSON_EXAMPLES);
  });

  it("has no lessons without blunders", () => {
    expect(buildLessons([])).toEqual([]);
  });

  it("replays the position, the move, the punishing reply, and the better move", () => {
    const steps = lessonSteps(move({}));
    expect(steps.map((step) => step.kind)).toEqual(["position", "played", "reply", "better"]);
    expect(steps[2]).toMatchObject({
      fen: "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b - - 0 1",
      travelUci: "e7e5",
    });
    expect(steps[3]).toMatchObject({ fen: START, travelUci: "e2e4", arrow: { uci: "e2e4", tone: "best" } });
  });

  it("skips the reply step when the game ended on the blunder", () => {
    expect(lessonSteps(move({ replyUci: "", replySan: "" })).map((step) => step.kind)).toEqual([
      "position",
      "played",
      "better",
    ]);
  });

  it("captions every step in plain language", () => {
    const blunder = move({ severityCp: 10_000 });
    expect(lessonCaption(blunder, "position")).toBe("Game 1, move 11. White to move. Look at the position first.");
    expect(lessonCaption(blunder, "played")).toBe("You played Nf3. It allowed a forced mate.");
    expect(lessonCaption(move({}), "played")).toBe("You played Nf3. It cost about 3.4 pawns.");
    expect(lessonCaption(blunder, "reply")).toBe("Your opponent's best answer is e5. That is what makes Nf3 a blunder.");
    expect(lessonCaption(blunder, "better")).toBe("Better was e4. Remember this idea for positions like this one.");
  });
});
