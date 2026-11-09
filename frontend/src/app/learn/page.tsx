import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";
import { LearnPersonal } from "@/components/learn-personal";
import { LessonDoneMark } from "@/components/lesson-done-mark";
import { CURRICULUM } from "@/lib/learn";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./learn.module.css";

export const metadata: Metadata = { title: messages.learnTitle };

/** LRN-01: the general curriculum, grouped by topic, next to the player's own lessons (LRN-05). */
export default function LearnPage() {
  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.head}>
        <h1>{messages.learnTitle}</h1>
        <p className={styles.lead}>{messages.learnIntro}</p>
      </div>
      <LearnPersonal />
      {CURRICULUM.map((category) => (
        <section key={category.id} className={styles.category} aria-labelledby={`category-${category.id}`}>
          <div className={styles.categoryHead}>
            <h2 id={`category-${category.id}`}>{category.title}</h2>
            <p>{category.blurb}</p>
          </div>
          <ul className={styles.lessons}>
            {category.lessons.map((lesson) => (
              <li key={lesson.slug}>
                <Link className={styles.lesson} href={`/learn/${lesson.slug}`}>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                  <span className={styles.summary}>{lesson.summary}</span>
                  <span className={styles.meta}>
                    {lesson.level}
                    <span aria-hidden="true" className={styles.dot} />
                    <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
                    {fill(messages.learnMinutes, { minutes: lesson.minutes })}
                  </span>
                  <LessonDoneMark slug={lesson.slug} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
