import { redirect } from "next/navigation";
import { currentUserKey } from "@/lib/auth";
import { readPlayers } from "@/lib/players";

/**
 * AUTH-06: a signed-in user tells Caissa their Chess.com username once, before the analysis pages open
 * (like Chessiro: sign in, then enter your username). Checked on the server, so nothing flickers.
 * Server code only: it reads the API secret.
 */

/** The signed-in user's saved usernames, or null when there is no user or the API cannot be reached. */
export async function savedPlayers(): Promise<string[] | null> {
  const user = await currentUserKey();
  const base = process.env.CAISSA_API_URL;
  const token = process.env.CAISSA_INTERNAL_TOKEN;
  if (user === null || !base || !token) {
    return null;
  }
  try {
    const response = await fetch(`${base}/me/players`, {
      headers: { accept: "application/json", "x-caissa-internal": token, "x-caissa-user": user },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? readPlayers(await response.json()) : null;
  } catch {
    return null;
  }
}

/** Sends a user with no saved username to the welcome step, then back to `next`. If the API is down, it lets them through. */
export async function requireOnboarded(next: string): Promise<void> {
  const players = await savedPlayers();
  if (players !== null && players.length === 0) {
    redirect(welcomePath(next));
  }
}

export function welcomePath(next: string): string {
  return `/welcome?next=${encodeURIComponent(next)}`;
}
