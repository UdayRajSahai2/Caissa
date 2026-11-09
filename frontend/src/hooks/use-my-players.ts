"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api-fetch";
import { readPlayers } from "@/lib/players";

/**
 * The Chess.com usernames the signed-in user saved (AUTH-02). null while unknown,
 * an empty list when signed out or nothing is saved yet.
 */
export function useMyPlayers(): { players: string[] | null; reload: () => void } {
  const { status } = useSession();
  const [players, setPlayers] = useState<string[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") {
      setPlayers(status === "unauthenticated" ? [] : null);
      return;
    }
    const controller = new AbortController();
    apiFetch(`me/players`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!controller.signal.aborted) {
          setPlayers(readPlayers(body));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPlayers([]);
        }
      });
    return () => controller.abort();
  }, [status, attempt]);

  return { players, reload: () => setAttempt((value) => value + 1) };
}
