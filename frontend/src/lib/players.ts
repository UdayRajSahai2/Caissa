import { isValidChessComUsername } from "@/lib/username";

/** The saved Chess.com usernames from a /me/players answer (AUTH-02); anything malformed is dropped. */
export function readPlayers(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("players" in body) || !Array.isArray(body.players)) {
    return [];
  }
  return body.players.filter((name): name is string => typeof name === "string" && isValidChessComUsername(name));
}
