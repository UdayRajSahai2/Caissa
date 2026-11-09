"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/button";
import { useProgress } from "@/components/progress-provider";
import { useSignIn } from "@/components/sign-in-dialog";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./lesson-done.module.css";

/** GAM-02/03: finishing a lesson earns XP once and counts toward Student and Scholar. */
export function LessonDone({ slug }: { slug: string }) {
  const { status } = useSession();
  const { progress, record } = useProgress();
  const openSignIn = useSignIn();
  const [busy, setBusy] = useState(false);
  const [gained, setGained] = useState<number | null>(null);
  const done = progress?.lessonsDone.includes(slug) ?? false;

  if (status === "unauthenticated") {
    return (
      <p className={styles.row}>
        <button type="button" className={styles.link} onClick={() => openSignIn(`/learn/${slug}`)}>
          {messages.lessonSignIn}
        </button>
      </p>
    );
  }

  async function markDone() {
    setBusy(true);
    const next = await record(`me/activity/lesson/${slug}/done`);
    setGained(next ? next.xpGained : null);
    setBusy(false);
  }

  return (
    <div className={styles.row} aria-live="polite">
      {done ? (
        <p className={styles.done}>
          <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
          {gained ? fill(messages.lessonDoneXp, { xp: gained }) : messages.lessonDone}
        </p>
      ) : (
        <Button onClick={() => void markDone()} disabled={busy || !progress} aria-busy={busy}>
          {messages.lessonMarkDone}
        </Button>
      )}
    </div>
  );
}
