import { describe, expect, it } from "vitest";
import {
  forgetReports,
  pollDelay,
  readLibraryReport,
  rememberedReport,
  rememberReport,
  sameLibraryReport,
  shouldQueueScore,
  type LibraryReport,
} from "@/lib/library-report";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("library report", () => {
  it("reads scored games and keeps each blunder's game", () => {
    const report = readLibraryReport({
      games_total: 2,
      games_analyzed: 1,
      games_scored: 1,
      blunders: [
        {
          game_id: "9",
          san: "e4",
          ply: 1,
          phase: "opening",
          severity_cp: 200,
          square: "e4",
          under_time_pressure: false,
          fen: START,
          played_uci: "e2e4",
          best_uci: "g1f3",
          best_san: "Nf3",
        },
      ],
    });
    expect(report?.gamesTotal).toBe(2);
    expect(report?.gamesAnalyzed).toBe(1);
    expect(report?.gamesScored).toBe(1);
    expect(report?.moves[0]?.gameId).toBe("9");
    expect(report?.moves[0]?.square).toBe("e4");
  });

  it("rejects a payload that is missing the counts", () => {
    expect(readLibraryReport(null)).toBeNull();
    expect(readLibraryReport({ games_total: "2", games_scored: 1, blunders: [] })).toBeNull();
    expect(readLibraryReport({ games_total: 1, games_scored: 1, blunders: {} })).toBeNull();
  });

  it("queues another batch only while games remain and the last request is old", () => {
    expect(shouldQueueScore(1, 2, 0, 12_000)).toBe(true);
    expect(shouldQueueScore(1, 2, 0, 11_999)).toBe(false);
    expect(shouldQueueScore(2, 2, 0, 20_000)).toBe(false);
  });
});

describe("polling without flicker", () => {
  function report(severityCp: number, gamesScored = 1): LibraryReport {
    return {
      gamesTotal: 2,
      gamesAnalyzed: 2,
      gamesScored,
      moves: [
        {
          san: "Nf3",
          ply: 3,
          phase: "opening",
          severityCp,
          square: "f3",
          underTimePressure: false,
          fen: START,
          playedUci: "g1f3",
          bestUci: "",
          bestSan: "",
          replyUci: "",
          replySan: "",
          gameId: "7",
        },
      ],
    };
  }

  it("treats an identical poll as the same report so the heatmap is not rebuilt", () => {
    expect(sameLibraryReport(report(300), report(300))).toBe(true);
  });

  it("sees new scores, new counts, and the first load as changes", () => {
    expect(sameLibraryReport(null, report(300))).toBe(false);
    expect(sameLibraryReport(report(300), report(310))).toBe(false);
    expect(sameLibraryReport(report(300, 1), report(300, 2))).toBe(false);
    expect(sameLibraryReport(report(300), { ...report(300), moves: [] })).toBe(false);
  });
});

describe("faster first look (FST-01, FST-02)", () => {
  const report: LibraryReport = { gamesTotal: 40, gamesAnalyzed: 12, gamesScored: 8, moves: [] };

  it("checks after 1 s and 2 s, then every 4 s", () => {
    expect([0, 1, 2, 3, 10].map(pollDelay)).toEqual([1_000, 2_000, 4_000, 4_000, 4_000]);
  });

  it("remembers the last report per player for this tab, and forgets all of them on sign-out", () => {
    forgetReports();
    expect(rememberedReport("Hikaru")).toBeNull();
    rememberReport("Hikaru", report);
    expect(rememberedReport("hikaru")).toEqual(report);
    expect(JSON.parse(window.sessionStorage.getItem("caissa:report:hikaru") ?? "null")).toEqual(report);
    forgetReports();
    expect(rememberedReport("hikaru")).toBeNull();
    expect(window.sessionStorage.getItem("caissa:report:hikaru")).toBeNull();
  });

  it("ignores a stored report that does not have the right shape", () => {
    forgetReports();
    window.sessionStorage.setItem("caissa:report:magnus", JSON.stringify({ gamesTotal: "lots" }));
    expect(rememberedReport("magnus")).toBeNull();
    window.sessionStorage.setItem("caissa:report:magnus", "{not json");
    expect(rememberedReport("magnus")).toBeNull();
    forgetReports();
  });
});
