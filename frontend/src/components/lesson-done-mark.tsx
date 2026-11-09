"use client";

import { CheckCircle2 } from "lucide-react";
import { useProgress } from "@/components/progress-provider";
import { messages } from "@/messages/en";
import styles from "./lesson-done.module.css";

/** A check on a lesson card the signed-in user has finished. Nothing when signed out or not done. */
export function LessonDoneMark({ slug }: { slug: string }) {
  const { progress } = useProgress();
  if (!progress?.lessonsDone.includes(slug)) {
    return null;
  }
  return (
    <span className={styles.mark}>
      <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
      {messages.lessonDone}
    </span>
  );
}
