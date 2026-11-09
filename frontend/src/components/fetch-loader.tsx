import { messages } from "@/messages/en";
import styles from "./fetch-loader.module.css";

/** A spinner with its message. The message is visible when given, otherwise read to screen readers only. */
export function FetchLoader({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className={label ? styles.row : undefined}>
      <div className={styles.loader} aria-hidden="true" />
      <span className={label ? undefined : styles.srOnly}>{label ?? messages.fetchingGames}</span>
    </div>
  );
}
