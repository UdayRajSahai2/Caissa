"use client";

import { useEffect, useState } from "react";
import { useJobPoller } from "@/hooks/use-job-poller";
import { primeBattleSound } from "@/lib/battle-sound";
import { apiFetch } from "@/lib/api-fetch";
import { messages } from "@/messages/en";

const DOWNLOAD_TIMEOUT_MS = 90_000;

/**
 * checking: asking the API what it has.
 * downloading: no saved games yet; Chess.com is being read (show progress, not the dashboard).
 * refreshing: saved games can be shown now; the newest month is checked in the background.
 * ready: saved games are current. failed: nothing to show; offer a retry.
 * signed-out: the session ended (AUTH-01).
 */
export type SyncPhase = "checking" | "downloading" | "refreshing" | "ready" | "failed" | "signed-out";

type SyncState = { phase: SyncPhase; message: string | null };

type LibraryAnswer = { detail?: unknown; status?: unknown; job_id?: unknown };

/** Makes sure a player's games are stored, and says when a background refresh brought new ones. */
export function useLibrarySync(username: string): SyncState & { refreshKey: number; retry: () => void } {
  const [state, setState] = useState<SyncState>({ phase: "checking", message: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const { poll } = useJobPoller(DOWNLOAD_TIMEOUT_MS);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let sound: ReturnType<typeof primeBattleSound> | null = null;
    setState({ phase: "checking", message: null });

    async function sync() {
      try {
        const response = await apiFetch(`library/${encodeURIComponent(username)}`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as LibraryAnswer | null;
        if (stopped) {
          return;
        }
        if (response.status === 401) {
          setState({ phase: "signed-out", message: null });
          return;
        }
        if (!response.ok) {
          setState({ phase: "failed", message: typeof body?.detail === "string" ? body.detail : messages.analyzeUnreachable });
          return;
        }
        if (body?.status === "ready") {
          setState({ phase: "ready", message: null });
          return;
        }
        if (typeof body?.job_id !== "string") {
          setState({ phase: "failed", message: messages.analyzeUnreachable });
          return;
        }
        const refreshing = body.status === "refreshing";
        setState({ phase: refreshing ? "refreshing" : "downloading", message: refreshing ? messages.gamesRefreshing : null });
        if (!refreshing) {
          sound = primeBattleSound();
          sound.play();
        }
        const result = await poll(body.job_id);
        sound?.stop();
        if (stopped || result.status === "aborted") {
          return;
        }
        if (result.status === "succeeded") {
          setState({ phase: "ready", message: null });
          if (refreshing) {
            setRefreshKey((key) => key + 1);
          }
          return;
        }
        if (refreshing) {
          setState({ phase: "ready", message: messages.gamesRefreshFailed });
          return;
        }
        setState({
          phase: "failed",
          message: result.status === "failed" ? (result.message ?? messages.analyzeUnreachable) : messages.fetchTimedOut,
        });
      } catch {
        if (!stopped && !controller.signal.aborted) {
          setState({ phase: "failed", message: messages.analyzeUnreachable });
        }
      }
    }

    void sync();
    return () => {
      stopped = true;
      controller.abort();
      sound?.stop();
    };
  }, [username, attempt, poll]);

  return { ...state, refreshKey, retry: () => setAttempt((value) => value + 1) };
}
