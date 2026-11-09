"use client";

import { useEffect, useRef } from "react";
import { Crown, X } from "lucide-react";
import { BadgeIcon } from "@/components/badge-icon";
import type { BadgeId } from "@/lib/progress";
import { BADGE_COPY } from "@/lib/progress-copy";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./progress-notice.module.css";

/**
 * GAM-05: a static, dismissible notice for a new badge or rank. It stays until dismissed (no timer,
 * WCAG 2.2.1), does not take focus, and is announced politely. Escape closes it.
 */
export function ProgressNotice({ badges, rank, onDismiss }: { badges: BadgeId[]; rank: string | null; onDismiss: () => void }) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismiss.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.notice} role="status">
      <ul>
        {rank ? (
          <li>
            <Crown size={24} strokeWidth={1.75} aria-hidden="true" />
            <strong>{fill(messages.rankUp, { rank })}</strong>
          </li>
        ) : null}
        {badges.map((badge) => (
          <li key={badge}>
            <BadgeIcon badge={badge} />
            <span>
              <strong>{fill(messages.badgeEarnedTitle, { name: BADGE_COPY[badge].name })}</strong>
              <span className={styles.how}>{BADGE_COPY[badge].how}</span>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.close} onClick={onDismiss} aria-label={messages.noticeDismiss}>
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
