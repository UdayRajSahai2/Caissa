"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ListOrdered } from "lucide-react";
import { LibraryReport } from "@/components/library-report";
import { ProgressSummary } from "@/components/progress-summary";
import { SyncStatus } from "@/components/sync-status";
import { useLibrarySync } from "@/hooks/use-library-sync";
import { gamesPath, playerPath, readPlayerView, type PlayerView } from "@/lib/player";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./player-page.module.css";

/** `/player/<username>` (NAV-04): sync the player's games, then the four analysis views. */
export function PlayerDashboard({ username }: { username: string }) {
  const router = useRouter();
  const view = readPlayerView(useSearchParams().get("view"));
  const sync = useLibrarySync(username);
  const showing = sync.phase === "ready" || sync.phase === "refreshing";
  // The stored report needs no sync or bot check, so it loads while the sync runs (FST-01).
  const loadingEarly = sync.phase === "checking";

  function chooseView(next: PlayerView) {
    router.replace(playerPath(username, next), { scroll: false });
  }

  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.head}>
        <h1>{fill(messages.analysisFor, { name: username })}</h1>
        {showing ? (
          <Link className={styles.jump} href={gamesPath(username)}>
            <ListOrdered size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.navGames}
          </Link>
        ) : null}
      </div>
      <ProgressSummary />
      {/* While checking, the report area shows the spinner itself and hides it once results arrive. */}
      {loadingEarly ? null : (
        <SyncStatus username={username} phase={sync.phase} message={sync.message} onRetry={sync.retry} />
      )}
      {showing || loadingEarly ? (
        <LibraryReport username={username} view={view} onView={chooseView} refreshKey={sync.refreshKey} waiting={loadingEarly} />
      ) : null}
    </div>
  );
}
