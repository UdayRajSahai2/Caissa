import Link from "next/link";
import { Info, LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { FetchLoader } from "@/components/fetch-loader";
import type { SyncPhase } from "@/hooks/use-library-sync";
import { messages } from "@/messages/en";
import styles from "./sync-status.module.css";

/** Every state of a player's sync has its own message (DSN-05); errors offer a next step (JOB-04). */
export function SyncStatus({
  username,
  phase,
  message,
  onRetry,
}: {
  username: string;
  phase: SyncPhase;
  message: string | null;
  onRetry: () => void;
}) {
  switch (phase) {
    case "checking":
      return <FetchLoader label={messages.playerOpening} />;
    case "downloading":
      return (
        <div className={styles.panel}>
          <FetchLoader />
          <p>{messages.playerDownloading}</p>
        </div>
      );
    case "refreshing":
    case "ready":
      return message ? (
        <p className={styles.notice} role="status">
          <Info size={20} strokeWidth={1.75} aria-hidden="true" />
          {message}
        </p>
      ) : (
        <p className="visually-hidden" role="status" />
      );
    case "failed":
      return (
        <div className={styles.failed} role="alert">
          <p>
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            {message ?? messages.analyzeUnreachable}
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onRetry}>
              {messages.libraryRetry}
            </Button>
            <Link href="/">{messages.playerTryAnother}</Link>
          </div>
        </div>
      );
    case "signed-out":
      return (
        <div className={styles.locked} role="alert">
          <p>
            <LockKeyhole size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.playerSignedOut}
          </p>
          <Link href={`/signin?callbackUrl=${encodeURIComponent(`/player/${encodeURIComponent(username)}`)}`}>
            {messages.signIn}
          </Link>
        </div>
      );
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}
