import type { Metadata } from "next";
import { ProgressView } from "@/components/progress-view";
import { requireOnboarded } from "@/lib/onboarding";
import { messages } from "@/messages/en";
import styles from "../learn/learn.module.css";

export const metadata: Metadata = { title: messages.progressTitle };

/** GAM-01..06: the signed-in user's private progress. Signed-out visitors are sent to /signin (middleware). */
export default async function ProgressPage() {
  await requireOnboarded("/progress");
  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.head}>
        <h1>{messages.progressTitle}</h1>
        <p className={styles.lead}>{messages.progressLead}</p>
      </div>
      <ProgressView />
    </div>
  );
}
