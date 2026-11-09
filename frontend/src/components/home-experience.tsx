import Image from "next/image";
import { Activity, GraduationCap, Grid3x3, Lock, Puzzle, type LucideIcon } from "lucide-react";
import { UsernameForm } from "@/components/username-form";
import { messages } from "@/messages/en";
import styles from "./home-experience.module.css";

const FEATURES: readonly { title: string; body: string; Icon: LucideIcon }[] = [
  { title: messages.heatmapTitle, body: messages.heatmapBody, Icon: Grid3x3 },
  { title: messages.reportTitle, body: messages.reportBody, Icon: Activity },
  { title: messages.puzzleTitle, body: messages.puzzleBody, Icon: Puzzle },
  { title: messages.lessonsTitle, body: messages.lessonsBody, Icon: GraduationCap },
];

/** Landing (Section 14.8): one focal plate, one search, four plain feature blurbs. */
export function HomeExperience() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.plate}>
          <Image
            className={styles.battle}
            src="/hero-knight.jpg"
            alt={messages.heroAlt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority
          />
        </div>
        <div className={`shell ${styles.heroInner}`}>
          <div className={styles.intro}>
            <h1 id="home-title">{messages.homeTitle}</h1>
            <p className={styles.lead}>{messages.homeLead}</p>
            <UsernameForm />
            <p className={styles.note}>
              <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
              {messages.homeNote}
            </p>
          </div>
        </div>
      </section>
      <section className={`shell ${styles.features}`} aria-labelledby="features-heading">
        <h2 id="features-heading">{messages.featuresHeading}</h2>
        <ul className={styles.featureList}>
          {FEATURES.map(({ title, body, Icon }) => (
            <li key={title} className={styles.feature}>
              <h3>
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                {title}
              </h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
