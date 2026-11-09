import { describe, expect, it } from "vitest";
import { gamesPath, playerNameFromSegment, playerPath, readPlayerView } from "@/lib/player";

describe("player urls", () => {
  it("builds the dashboard, view, and games paths", () => {
    expect(playerPath("hikaru")).toBe("/player/hikaru");
    expect(playerPath("hikaru", "heatmap")).toBe("/player/hikaru");
    expect(playerPath("hikaru", "puzzles")).toBe("/player/hikaru?view=puzzles");
    expect(gamesPath("Magnus_C-1")).toBe("/player/Magnus_C-1/games");
  });

  it("opens the heatmap for a missing or unknown view", () => {
    expect(readPlayerView(null)).toBe("heatmap");
    expect(readPlayerView("<script>")).toBe("heatmap");
    expect(readPlayerView("lessons")).toBe("lessons");
  });

});

describe("player name from the url", () => {
  it("accepts a valid name and rejects anything else without throwing", () => {
    expect(playerNameFromSegment("hikaru")).toBe("hikaru");
    expect(playerNameFromSegment("ab")).toBeNull();
    expect(playerNameFromSegment("%3Cscript%3E")).toBeNull();
    expect(playerNameFromSegment("%E0%A4%A")).toBeNull();
  });
});
