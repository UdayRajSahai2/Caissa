"use client";

import Link from "next/link";
import { useMyPlayers } from "@/hooks/use-my-players";
import { playerPath } from "@/lib/player";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./learn-personal.module.css";

/** LRN-05: once a signed-in user has a verified account, point back to lessons and puzzles from their games. */
export function LearnPersonal() {
  const { players } = useMyPlayers();
  const player = players?.[0] ?? null;

  if (!player) {
    return null;
  }
  return (
    <aside className={styles.card} aria-labelledby="learn-personal-heading">
      <h2 id="learn-personal-heading">{messages.learnPersonalHeading}</h2>
      <p>{fill(messages.learnPersonalBody, { name: player })}</p>
      <div className={styles.links}>
        <Link href={playerPath(player, "lessons")}>{messages.learnPersonalLessons}</Link>
        <Link href={playerPath(player, "puzzles")}>{messages.learnPersonalPuzzles}</Link>
      </div>
    </aside>
  );
}
