"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { BlunderStudy } from "@/components/blunder-study";
import { Button } from "@/components/button";
import { FetchLoader } from "@/components/fetch-loader";
import { GameReview } from "@/components/game-review";
import { MiniBoard } from "@/components/mini-board";
import { useJobPoller, type JobPollResult } from "@/hooks/use-job-poller";
import { primeBattleSound } from "@/lib/battle-sound";
import { apiFetch } from "@/lib/api-fetch";
import { readGameMoves } from "@/lib/game-review";
import { readGamePage, type GameCard, type GamePagePayload } from "@/lib/library-payload";
import { messages } from "@/messages/en";
import styles from "./game-list.module.css";

const PAGE_SIZE = 10;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const SCORE_TIMEOUT_MS = 6 * 60 * 1000;

type Blunder = {
  san: string;
  ply: number;
  phase: string;
  severity_cp: number;
  square: string;
  under_time_pressure: boolean;
};

type GameDetail = GameCard & { blunders: Blunder[]; moves?: unknown };

export function GameList({ username, refreshKey = 0 }: { username: string; refreshKey?: number }) {
  const regionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [data, setData] = useState<GamePagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingPage, setFetchingPage] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const ticket = useRef(0);
  const paging = useRef(false);
  const { poll: pollPage, cancel: cancelPage } = useJobPoller(DOWNLOAD_TIMEOUT_MS);
  const { poll: pollScore, cancel: cancelScore } = useJobPoller(SCORE_TIMEOUT_MS);

  useEffect(() => {
    ticket.current += 1;
    setPage(1);
    setSelectedId(null);
    setDetail(null);
    setScoreError(null);
    setScoring(false);
    setData(null);
    setLoading(true);
    return () => {
      cancelPage();
      cancelScore();
    };
  }, [username, cancelPage, cancelScore]);

  useEffect(() => {
    let stopped = false;
    setLoading(true);
    setError(null);
    void apiFetch(`library/${encodeURIComponent(username)}/games?page=${page}&page_size=${PAGE_SIZE}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("page");
        }
        const body = readGamePage(await response.json());
        if (body === null) {
          throw new Error("page");
        }
        return body;
      })
      .then((body) => {
        if (!stopped) {
          setData(body);
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          regionRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        }
      })
      .catch(() => {
        if (!stopped) {
          setData(null);
          setError(messages.analyzeUnreachable);
        }
      })
      .finally(() => {
        if (!stopped) {
          setLoading(false);
        }
      });
    return () => {
      stopped = true;
    };
  }, [username, page, loadAttempt, refreshKey]);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [selectedId, scoring]);

  async function changePage(next: number) {
    if (next < 1 || fetchingPage || paging.current) {
      return;
    }
    paging.current = true;
    const sound = primeBattleSound();
    setError(null);
    try {
      const response = await apiFetch(`library/${encodeURIComponent(username)}?page=${next}&page_size=${PAGE_SIZE}`,
      );
      const body = await readObject(response);
      if (!response.ok || body === null) {
        setError(typeof body?.detail === "string" ? body.detail : messages.analyzeUnreachable);
        return;
      }
      if (body.status === "queued" && typeof body.job_id === "string") {
        setFetchingPage(true);
        sound.play();
        const finished = await waitForJob(body.job_id, pollPage);
        if (!finished) {
          return;
        }
      }
      setPage(next);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : messages.analyzeUnreachable);
    } finally {
      paging.current = false;
      sound.stop();
      setFetchingPage(false);
    }
  }

  async function openGame(game: GameCard) {
    const mine = ticket.current + 1;
    ticket.current = mine;
    setSelectedId(game.id);
    setDetail(null);
    setScoreError(null);
    setScoring(true);
    try {
      const accepted = await apiFetch(`games/${encodeURIComponent(game.id)}/analyze`, {
        method: "POST",
      });
      const body = await readObject(accepted);
      if (ticket.current !== mine) {
        return;
      }
      if (!accepted.ok || body === null) {
        setScoreError(typeof body?.detail === "string" ? body.detail : messages.analyzeUnreachable);
        return;
      }
      if (body.status !== "ready" && typeof body.job_id === "string") {
        const finished = await waitForJob(body.job_id, pollScore);
        if (!finished) {
          return;
        }
      }
      if (ticket.current !== mine) {
        return;
      }
      await loadDetail(game.id);
    } catch (err) {
      if (ticket.current === mine) {
        setScoreError(err instanceof Error && err.message ? err.message : messages.analyzeUnreachable);
      }
    } finally {
      if (ticket.current === mine) {
        setScoring(false);
      }
    }
  }

  async function waitForJob(
    jobId: string,
    poll: (id: string) => Promise<JobPollResult>,
  ): Promise<boolean> {
    const result = await poll(jobId);
    if (result.status === "aborted") {
      return false;
    }
    if (result.status === "failed") {
      throw new Error(result.message ?? messages.analyzeUnreachable);
    }
    if (result.status === "timed_out") {
      throw new Error(messages.fetchTimedOut);
    }
    if (result.status !== "succeeded") {
      throw new Error(messages.analyzeUnreachable);
    }
    return true;
  }

  async function loadDetail(gameId: string) {
    const response = await apiFetch(`games/${gameId}`);
    if (!response.ok) {
      throw new Error(messages.analyzeUnreachable);
    }
    const body: unknown = await response.json();
    if (!isGameDetail(body)) {
      throw new Error(messages.analyzeUnreachable);
    }
    setDetail(body);
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = data?.games.find((game) => game.id === selectedId) ?? null;

  return (
    <section ref={regionRef} className={styles.region} aria-labelledby="games-heading">
      <h2 id="games-heading">{messages.gamesHeading}</h2>
      <p className={styles.player}>
        {messages.gamesFor} {username}
      </p>
      {loading ? <FetchLoader /> : null}
      {error ? (
        <div className={styles.alert} role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            {messages.gamesRetry}
          </Button>
        </div>
      ) : null}
      {!loading && data && data.games.length === 0 ? <p>{messages.gamesEmpty}</p> : null}
      <ul className={styles.list}>
        {(data?.games ?? []).map((game) => (
          <li key={game.id}>
            <button
              type="button"
              className={`${styles.card} ${toneClass(game.result)}`}
              aria-expanded={selectedId === game.id}
              onClick={() => void openGame(game)}
            >
              <MiniBoard fen={game.final_fen} orientation={game.player_color === "black" ? "black" : "white"} />
              <span className={styles.result}>{resultLabel(game.result)}</span>
              <span className={styles.opponent}>{game.opponent}</span>
              <span className={styles.meta}>
                {messages.youPlayed} {game.player_color}
                {game.time_class ? `. ${label(game.time_class)}` : ""}
                {playedOn(game.played_at)}
              </span>
              <span className={styles.action}>{game.analyzed ? messages.viewScore : messages.scoreThis}</span>
            </button>
          </li>
        ))}
      </ul>
      {fetchingPage ? <FetchLoader /> : null}
      {page > 1 || (data?.games.length ?? 0) === PAGE_SIZE ? (
        <nav className={styles.pager} aria-label={messages.gamesHeading}>
          <Button variant="secondary" disabled={page <= 1 || fetchingPage} onClick={() => void changePage(page - 1)}>
            {messages.gamesPrevious}
          </Button>
          <span>
            {messages.gamesPage} {page} / {pages}
          </span>
          <Button
            variant="secondary"
            disabled={fetchingPage || ((data?.games.length ?? 0) < PAGE_SIZE && page >= pages)}
            onClick={() => void changePage(page + 1)}
          >
            {messages.gamesNext}
          </Button>
        </nav>
      ) : null}
      {selected ? (
        <div ref={panelRef} className={styles.panel} role="region" aria-live="polite" aria-busy={scoring}>
          <h3>
            {resultLabel(selected.result)} against {selected.opponent}
          </h3>
          {scoring ? (
            <div className={styles.scoring}>
              <Image src="/chess-battle.jpg" alt="" width={320} height={320} className={styles.battle} />
              <p>{messages.scoringTitle}</p>
              <div className={styles.track} aria-hidden="true">
                <span className={styles.bar} />
              </div>
            </div>
          ) : null}
          {scoreError ? <p className={styles.error}>{scoreError}</p> : null}
          {detail && !scoring ? (
            <GameReview
              key={`review-${detail.id}`}
              gameId={detail.id}
              moves={readGameMoves(detail.moves)}
              orientation={selected.player_color === "black" ? "black" : "white"}
              opponent={selected.opponent}
            />
          ) : null}
          {detail && !scoring ? (
            <BlunderStudy
              key={detail.id}
              blunders={detail.blunders}
              orientation={selected.player_color === "black" ? "black" : "white"}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function toneClass(result: string): string {
  if (result === "win") {
    return styles.win;
  }
  if (result === "loss") {
    return styles.loss;
  }
  if (result === "draw") {
    return styles.draw;
  }
  return "";
}

function resultLabel(result: string): string {
  if (result === "win") {
    return messages.resultWin;
  }
  if (result === "loss") {
    return messages.resultLoss;
  }
  if (result === "draw") {
    return messages.resultDraw;
  }
  return messages.resultUnknown;
}

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function playedOn(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const formatted = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `. ${formatted}`;
}

async function readObject(response: Response): Promise<Record<string, unknown> | null> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function isGameDetail(value: unknown): value is GameDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = value as Record<string, unknown>;
  return typeof body.id === "string" && Array.isArray(body.blunders);
}

