import { describe, expect, it } from "vitest";
import { readGamePage } from "@/lib/library-payload";

const card = {
  id: "1",
  result: "win",
  player_color: "white",
  opponent: "bob",
  time_class: "blitz",
  played_at: "2026-10-01T00:00:00+00:00",
  final_fen: "8/8/8/8/8/8/8/8 w - - 0 1",
  analyzed: false,
};

const page = { page: 1, page_size: 10, total: 1, games: [card] };

describe("readGamePage", () => {
  it("accepts a page of game cards", () => {
    expect(readGamePage(page)).toEqual(page);
  });

  it("accepts a null played date and an empty list", () => {
    const empty = { page: 1, page_size: 10, total: 0, games: [] };
    expect(readGamePage(empty)?.games).toEqual([]);
    expect(readGamePage({ ...page, games: [{ ...card, played_at: null }] })?.games[0]?.played_at).toBeNull();
  });

  it.each([
    null,
    [],
    "games",
    { page: 1, page_size: 10, total: 1 },
    { page: "1", page_size: 10, total: 1, games: [] },
    { page: 1, page_size: 10, total: 1, games: [null] },
    { page: 1, page_size: 10, total: 1, games: [{ ...card, opponent: 4 }] },
    { page: 1, page_size: 10, total: 1, games: [{ ...card, analyzed: "no" }] },
    { page: 1, page_size: 10, total: 1, games: [{ ...card, played_at: 1 }] },
  ])("rejects a malformed page", (payload) => {
    expect(readGamePage(payload)).toBeNull();
  });
});
