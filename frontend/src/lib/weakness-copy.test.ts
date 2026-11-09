import { describe, expect, it } from "vitest";
import { exportLines, exportText, fill, insightCards, reportFileName } from "@/lib/weakness-copy";
import { buildWeaknessReport } from "@/lib/weakness-report";
import type { ReviewMove } from "@/lib/review";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function move(overrides: Partial<ReviewMove>): ReviewMove {
  return {
    san: "Nf3",
    ply: 21,
    phase: "middlegame",
    severityCp: 300,
    square: "f3",
    underTimePressure: false,
    fen: START,
    playedUci: "g1f3",
    bestUci: "d2d4",
    bestSan: "d4",
    replyUci: "",
    replySan: "",
    gameId: "7",
    ...overrides,
  };
}

describe("weakness report copy", () => {
  it("fills named slots and leaves unknown ones visible", () => {
    expect(fill("{a} and {b}", { a: 1, b: "two" })).toBe("1 and two");
    expect(fill("{missing}", {})).toBe("{missing}");
  });

  it("writes one card per insight, each with a number and something to try", () => {
    const report = buildWeaknessReport(
      [move({ underTimePressure: true }), move({ ply: 23, underTimePressure: true }), move({ ply: 25, severityCp: 700 })],
      4,
    );
    const cards = insightCards(report);
    expect(cards.map((card) => card.id)).toEqual(["rate", "phase", "clock", "piece", "square", "swing"]);
    expect(cards.find((card) => card.id === "clock")).toMatchObject({
      headline: "The clock causes many of your blunders",
      figure: "67% came with under 30 seconds left",
    });
    expect(cards.find((card) => card.id === "piece")?.headline).toBe("Your knight moves go wrong most often");
    for (const card of cards) {
      expect(card.figure).toMatch(/\d/);
      expect(card.action.length).toBeGreaterThan(0);
    }
  });

  it("calls the clock a calculation issue when few blunders came under 30 seconds", () => {
    const cards = insightCards(buildWeaknessReport([move({})], 1));
    expect(cards.find((card) => card.id === "clock")?.headline).toBe(
      "Most blunders happen with time still on the clock",
    );
    expect(cards.some((card) => card.id === "swing")).toBe(false);
  });

  it("has no cards when there are no blunders", () => {
    expect(insightCards(buildWeaknessReport([], 3))).toEqual([]);
  });

  it("exports the same report as readable text", () => {
    const report = buildWeaknessReport([move({ severityCp: 10_000, underTimePressure: true })], 1);
    const text = exportText(exportLines("Hikaru", report, "6 November 2026"));
    expect(text).toContain("Weakness report for Hikaru");
    expect(text).toContain("Based on 1 blunders in 1 scored games.");
    expect(text).toContain("What stands out\n---------------");
    expect(text).toContain("Try this:");
    expect(text).toContain("Middlegame: 1 blunders (100%), average loss Only mates, 1 under 30 seconds.");
    expect(text).toContain("11. Nf3 in game 7. Allowed mate. Better move: d4. Under 30 seconds.");
    expect(text).toContain("Made on 6 November 2026 with Caissa, free and open source.");
  });

  it("names files by username and date without unsafe characters", () => {
    expect(reportFileName("Magnus_C-1", "2026-11-06", "png")).toBe("caissa-report-magnus_c-1-2026-11-06.png");
    expect(reportFileName("a/../b", "2026-11-06", "txt")).toBe("caissa-report-ab-2026-11-06.txt");
  });
});

describe("number formatting in copy", () => {
  it("adds thousands separators to numbers but leaves text and decimals alone", () => {
    expect(fill("{n} blunders in {g} games", { n: 1253, g: 219 })).toBe("1,253 blunders in 219 games");
    expect(fill("{rate} a game", { rate: 5.7 })).toBe("5.7 a game");
    expect(fill("game {id}", { id: "12345" })).toBe("game 12345");
  });
});
