import { describe, expect, it } from "vitest";
import { isValidChessComUsername } from "@/lib/username";

describe("isValidChessComUsername", () => {
  it.each(["hikaru", "abc", "player_one", "player-two", "A1b", "a".repeat(25)])(
    "accepts %s",
    (username) => {
      expect(isValidChessComUsername(username)).toBe(true);
    },
  );

  it.each([
    "",
    " ",
    "ab",
    "a".repeat(26),
    " hikaru",
    "hikaru ",
    "has space",
    "../etc",
    "name/extra",
    "name?x=1",
    "javascript:alert(1)",
    "user@host",
    "user\nname",
    "híkaru",
    "<script>",
    ".",
    "..",
  ])("rejects %s", (username) => {
    expect(isValidChessComUsername(username)).toBe(false);
  });
});
