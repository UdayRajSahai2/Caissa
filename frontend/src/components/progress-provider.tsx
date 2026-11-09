"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { ProgressNotice } from "@/components/progress-notice";
import { apiFetch } from "@/lib/api-fetch";
import { readProgress, timezoneOffset, type BadgeId, type ProgressData } from "@/lib/progress";

type Notice = { badges: BadgeId[]; rank: string | null };

type ProgressContextValue = {
  progress: ProgressData | null;
  /** The Chess.com player whose puzzle schedule `progress.puzzles` holds. */
  player: string | null;
  loadPlayer: (player: string) => void;
  record: (path: string, query?: Record<string, string>) => Promise<ProgressData | null>;
  reset: () => Promise<boolean>;
};

const ProgressContext = createContext<ProgressContextValue>({
  progress: null,
  player: null,
  loadPlayer: () => undefined,
  record: () => Promise.resolve(null),
  reset: () => Promise.resolve(false),
});

/** GAM-01..05: one shared copy of the signed-in user's progress. Signed out, everything is a no-op. */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const playerRef = useRef<string | null>(null);

  const load = useCallback(async (name: string | null) => {
    const query = new URLSearchParams({ tz: String(timezoneOffset()) });
    if (name) {
      query.set("player", name);
    }
    try {
      const response = await apiFetch(`me/progress?${query.toString()}`);
      const next = response.ok ? readProgress(await response.json()) : null;
      if (next && playerRef.current === name) {
        setProgress(next);
        setPlayer(name);
      }
    } catch {
      // Progress is an extra; the page works without it.
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setProgress(null);
      setPlayer(null);
      playerRef.current = null;
      return;
    }
    void load(playerRef.current);
  }, [signedIn, load]);

  const loadPlayer = useCallback(
    (name: string) => {
      const key = name.toLowerCase();
      if (!signedIn || playerRef.current === key) {
        return;
      }
      playerRef.current = key;
      void load(key);
    },
    [signedIn, load],
  );

  const record = useCallback(
    async (path: string, query: Record<string, string> = {}) => {
      if (!signedIn) {
        return null;
      }
      const params = new URLSearchParams({ ...query, tz: String(timezoneOffset()) });
      try {
        const response = await apiFetch(`${path}?${params.toString()}`, { method: "POST" });
        const next = response.ok ? readProgress(await response.json()) : null;
        if (!next) {
          return null;
        }
        const forPlayer = query.player?.toLowerCase() ?? null;
        setProgress((previous) => (forPlayer === null || forPlayer !== playerRef.current ? { ...next, puzzles: previous?.puzzles ?? [] } : next));
        if (next.newBadges.length > 0 || next.newRank) {
          setNotice({ badges: next.newBadges, rank: next.newRank ? next.rank : null });
        }
        return next;
      } catch {
        return null;
      }
    },
    [signedIn],
  );

  const reset = useCallback(async () => {
    try {
      const response = await apiFetch("me/progress/reset", { method: "POST" });
      if (!response.ok) {
        return false;
      }
      await load(playerRef.current);
      return true;
    } catch {
      return false;
    }
  }, [load]);

  const value = useMemo(() => ({ progress, player, loadPlayer, record, reset }), [progress, player, loadPlayer, record, reset]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
      {notice ? <ProgressNotice badges={notice.badges} rank={notice.rank} onDismiss={() => setNotice(null)} /> : null}
    </ProgressContext.Provider>
  );
}

export function useProgress(): ProgressContextValue {
  return useContext(ProgressContext);
}
