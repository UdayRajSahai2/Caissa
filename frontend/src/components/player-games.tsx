"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { GameList } from "@/components/game-list";
import { SyncStatus } from "@/components/sync-status";
import { useLibrarySync } from "@/hooks/use-library-sync";
import { playerPath } from "@/lib/player";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./player-page.module.css";

/** `/player/<username>/games` (NAV-04): the player's games, ten at a time, each one open to score. */
export function PlayerGames({ username }: { username: string }) {
  const sync = useLibrarySync(username);
  const showing = sync.phase === "ready" || sync.phase === "refreshing";

  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.head}>
        <h1>{fill(messages.gamesTitle, { name: username })}</h1>
        {showing ? (
          <Link className={styles.jump} href={playerPath(username)}>
            <BarChart3 size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.navAnalyze}
          </Link>
        ) : null}
      </div>
      <SyncStatus username={username} phase={sync.phase} message={sync.message} onRetry={sync.retry} />
      {showing ? <GameList username={username} refreshKey={sync.refreshKey} /> : null}
    </div>
  );
}
