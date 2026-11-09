/** Player URLs (NAV-04) and reading a player name from a URL segment. */
import { isValidChessComUsername } from "@/lib/username";

export type PlayerView = "heatmap" | "report" | "puzzles" | "lessons";

export const PLAYER_VIEWS: readonly PlayerView[] = ["heatmap", "report", "puzzles", "lessons"];


export function playerPath(username: string, view?: PlayerView): string {
  const base = `/player/${encodeURIComponent(username)}`;
  return view && view !== "heatmap" ? `${base}?view=${view}` : base;
}

export function gamesPath(username: string): string {
  return `/player/${encodeURIComponent(username)}/games`;
}

/** The heatmap is the hero view (C-07), so anything unknown opens it. */
export function readPlayerView(value: string | null): PlayerView {
  return PLAYER_VIEWS.find((view) => view === value) ?? "heatmap";
}


/** The username from a `/player/<name>` segment, or null when it is not a valid Chess.com name (ING-01). */
export function playerNameFromSegment(segment: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return isValidChessComUsername(name) ? name : null;
}
