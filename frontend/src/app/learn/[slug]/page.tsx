import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Lightbulb } from "lucide-react";
import { DiagramPlayer } from "@/components/diagram-player";
import { LessonDone } from "@/components/lesson-done";
import { SoundToggle } from "@/components/sound-toggle";
import { findLesson, neighbours } from "@/lib/learn";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "../learn.module.css";

type Props = { params: Promise<{ slug: string }> };

// Rendered per request so every response carries its own CSP nonce (middleware.ts); a prerendered
// page would have no nonce and the browser would refuse its scripts. Unknown slugs still 404 below.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = findLesson((await params).slug);
  return lesson ? { title: lesson.title, description: lesson.summary } : {};
}

/** One general lesson (LRN-02): plain text, then boards that step through the idea. */
export default async function LessonPage({ params }: Props) {
  const lesson = findLesson((await params).slug);
  if (!lesson) {
    notFound();
  }
  const { previous, next } = neighbours(lesson.slug);
  return (
    <article className={`shell ${styles.page} ${styles.article}`}>
      <div className={styles.head}>
        <Link className={styles.back} href="/learn">
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          {messages.learnBack}
        </Link>
        <h1>{lesson.title}</h1>
        <p className={styles.lead}>{lesson.summary}</p>
        <div className={styles.tools}>
          <p className={styles.meta}>
            {lesson.level}
            <span aria-hidden="true" className={styles.dot} />
            {fill(messages.learnMinutes, { minutes: lesson.minutes })}
          </p>
          <SoundToggle />
        </div>
      </div>
      {lesson.sections.map((section, index) => (
        <section key={section.heading} className={styles.section} aria-labelledby={`section-${index}`}>
          <h2 id={`section-${index}`}>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className={styles.prose}>
              {paragraph}
            </p>
          ))}
          {section.diagram ? (
            <DiagramPlayer diagram={section.diagram} label={fill(messages.diagramBoardLabel, { heading: section.heading })} />
          ) : null}
        </section>
      ))}
      <aside className={styles.takeaway} aria-labelledby="takeaway-heading">
        <h2 id="takeaway-heading">
          <Lightbulb size={20} strokeWidth={1.75} aria-hidden="true" />
          {messages.learnTakeaway}
        </h2>
        <p>{lesson.takeaway}</p>
        <LessonDone slug={lesson.slug} />
      </aside>
      <nav className={styles.pager} aria-label={messages.learnPagerLabel}>
        {previous ? (
          <Link href={`/learn/${previous.slug}`} className={styles.pagerLink}>
            <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <span className={styles.pagerHint}>{messages.learnPrevious}</span>
              {previous.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/learn/${next.slug}`} className={`${styles.pagerLink} ${styles.pagerNext}`}>
            <span>
              <span className={styles.pagerHint}>{messages.learnNext}</span>
              {next.title}
            </span>
            <ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
