import { describe, expect, it } from "vitest";
import { buildWeaknessReport } from "@/lib/weakness-report";
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
    bestUci: "d2d4",
    bestSan: "d4",
    replyUci: "",
    replySan: "",
    gameId: "1",
    ...overrides,
  };
}

describe("weakness report", () => {
  it("summarises rate, phase, clock, piece, square and big swings", () => {
    const report = buildWeaknessReport(
      [
        move({ san: "Nf3", playedUci: "g1f3", ply: 21, severityCp: 300, underTimePressure: true }),
        move({ san: "Nxf3", playedUci: "e5f3", ply: 23, severityCp: 10_000, gameId: "2" }),
        move({ san: "Qd2", playedUci: "d1d2", ply: 5, phase: "opening", severityCp: 600 }),
        move({ san: "Nc3", playedUci: "b1c3", ply: 61, phase: "endgame", severityCp: 160, underTimePressure: true }),
      ],
      8,
    );

    expect(report.blunders).toBe(4);
    expect(report.perGame).toBe(0.5);
    expect(report.worstPhase?.id).toBe("middlegame");
    expect(report.worstPhase?.share).toBe(50);
    expect(report.underPressure).toBe(2);
    expect(report.pressureShare).toBe(50);
    expect(report.piece).toEqual({ id: "n", share: 75 });
    expect(report.square).toEqual({ id: "f3", count: 2 });
    expect(report.bigSwings).toBe(2);
  });

  it("averages a phase without counting an allowed mate as centipawns", () => {
    const report = buildWeaknessReport(
      [move({ severityCp: 300 }), move({ severityCp: 10_000, ply: 3 }), move({ severityCp: 200, ply: 5 })],
      1,
    );
    const middlegame = report.phases.find((row) => row.id === "middlegame");
    expect(middlegame?.count).toBe(3);
    expect(middlegame?.averageCp).toBe(250);
    expect(report.phases.find((row) => row.id === "endgame")).toEqual({
      id: "endgame",
      count: 0,
      share: 0,
      averageCp: null,
      underPressure: 0,
    });
  });

  it("breaks a phase tie toward the earlier phase", () => {
    const report = buildWeaknessReport(
      [move({ phase: "endgame", ply: 70 }), move({ phase: "opening", ply: 4 })],
      1,
    );
    expect(report.worstPhase?.id).toBe("opening");
  });

  it("lists the costliest blunders first, with the better move and mate flag", () => {
    const report = buildWeaknessReport(
      [
        move({ ply: 1, severityCp: 200 }),
        move({ ply: 3, severityCp: 10_000, san: "Kh1", bestSan: "", bestUci: "g1g2" }),
        move({ ply: 6, severityCp: 900, san: "Qh5" }),
      ],
      3,
    );
    expect(report.costliest.map((entry) => entry.label)).toEqual(["2. Kh1", "3... Qh5", "1. e4"]);
    expect(report.costliest[0]).toMatchObject({ mate: true, better: "g1 to g2" });
    expect(report.costliest[1]).toMatchObject({ mate: false, better: "d4" });
  });

  it("keeps at most five costliest blunders", () => {
    const moves = Array.from({ length: 9 }, (_, index) => move({ ply: index + 1, severityCp: 150 + index }));
    expect(buildWeaknessReport(moves, 2).costliest).toHaveLength(5);
  });

  it("is empty but safe with no blunders and no games", () => {
    const report = buildWeaknessReport([], 0);
    expect(report.perGame).toBe(0);
    expect(report.worstPhase).toBeNull();
    expect(report.piece).toBeNull();
    expect(report.square).toBeNull();
    expect(report.pressureShare).toBe(0);
    expect(report.costliest).toEqual([]);
  });
});
