import { apiFetch } from "@/lib/api-fetch";
import { readReviewMoves, type ReviewMove } from "@/lib/review";

export type LibraryReport = {
  gamesTotal: number;
  gamesAnalyzed: number;
  gamesScored: number;
  moves: ReviewMove[];
};

const POST_GAP_MS = 12_000;

export function readLibraryReport(value: unknown): LibraryReport | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.games_total !== "number" ||
    !Number.isFinite(body.games_total) ||
    typeof body.games_analyzed !== "number" ||
    !Number.isFinite(body.games_analyzed) ||
    typeof body.games_scored !== "number" ||
    !Number.isFinite(body.games_scored) ||
    !Array.isArray(body.blunders)
  ) {
    return null;
  }
  return {
    gamesTotal: body.games_total,
    gamesAnalyzed: body.games_analyzed,
    gamesScored: body.games_scored,
    moves: readReviewMoves(body.blunders),
  };
}

export async function loadLibraryReport(username: string, signal: AbortSignal): Promise<LibraryReport> {
  const response = await apiFetch(`library/${encodeURIComponent(username)}/report`, { signal });
  if (!response.ok) {
    throw new Error("report");
  }
  const report = readLibraryReport(await response.json());
  if (report === null) {
    throw new Error("report");
  }
  return report;
}

export async function queueLibraryScore(username: string, signal: AbortSignal): Promise<void> {
  const response = await apiFetch(`library/${encodeURIComponent(username)}/analyze`, {
    method: "POST",
    signal,
  });
  if (response.ok || response.status === 429) {
    return;
  }
  throw new Error("score");
}

/**
 * True when a poll brought back exactly what is already on screen.
 * Keeping the old object then skips the heatmap rebuild, so polling cannot make the board flicker.
 */
export function sameLibraryReport(previous: LibraryReport | null, next: LibraryReport): boolean {
  if (
    previous === null ||
    previous.gamesTotal !== next.gamesTotal ||
    previous.gamesAnalyzed !== next.gamesAnalyzed ||
    previous.gamesScored !== next.gamesScored ||
    previous.moves.length !== next.moves.length
  ) {
    return false;
  }
  return previous.moves.every((move, index) => {
    const other = next.moves[index];
    return (
      other !== undefined &&
      move.gameId === other.gameId &&
      move.ply === other.ply &&
      move.san === other.san &&
      move.severityCp === other.severityCp &&
      move.phase === other.phase &&
      move.square === other.square &&
      move.playedUci === other.playedUci &&
      move.bestUci === other.bestUci &&
      move.bestSan === other.bestSan &&
      move.replyUci === other.replyUci &&
      move.fen === other.fen &&
      move.underTimePressure === other.underTimePressure
    );
  });
}

export function shouldQueueScore(scored: number, total: number, lastQueuedAt: number, now: number): boolean {
  return scored < total && now - lastQueuedAt >= POST_GAP_MS;
}

/** FST-01: checks after 1 s and 2 s, then every 4 s while games are still being scored. */
const POLL_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export function pollDelay(tick: number): number {
  return POLL_DELAYS_MS[Math.min(tick, POLL_DELAYS_MS.length - 1)] ?? 4_000;
}

const CACHE_PREFIX = "caissa:report:";
const remembered = new Map<string, LibraryReport>();

/**
 * FST-02: the last report for a player in this tab session, shown at once on return.
 * Memory first; sessionStorage survives a reload. Storage can be missing or full, so it is optional.
 */
export function rememberedReport(username: string): LibraryReport | null {
  const key = username.toLowerCase();
  const inMemory = remembered.get(key);
  if (inMemory) {
    return inMemory;
  }
  try {
    const stored = window.sessionStorage.getItem(CACHE_PREFIX + key);
    const report = stored ? storedReport(JSON.parse(stored)) : null;
    if (report) {
      remembered.set(key, report);
    }
    return report;
  } catch {
    return null;
  }
}

export function rememberReport(username: string, report: LibraryReport): void {
  const key = username.toLowerCase();
  remembered.set(key, report);
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(report));
  } catch {
    // A full or blocked storage only costs the instant view after a reload.
  }
}

/** Sign-out clears every remembered report (PWA-02 does the same for the offline cache). */
export function forgetReports(): void {
  remembered.clear();
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(CACHE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Nothing stored, or storage is blocked.
  }
}

function storedReport(value: unknown): LibraryReport | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.gamesTotal !== "number" ||
    typeof body.gamesAnalyzed !== "number" ||
    typeof body.gamesScored !== "number" ||
    !Array.isArray(body.moves)
  ) {
    return null;
  }
  const moves = body.moves.filter(
    (move: unknown): move is ReviewMove =>
      typeof move === "object" && move !== null && typeof (move as ReviewMove).gameId === "string" && typeof (move as ReviewMove).ply === "number",
  );
  return { gamesTotal: body.gamesTotal, gamesAnalyzed: body.gamesAnalyzed, gamesScored: body.gamesScored, moves };
}
