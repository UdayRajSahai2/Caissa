import type { ReactNode } from "react";
import styles from "./card.module.css";

type CardProps = {
  title: string;
  tone?: "board" | "walnut" | "info";
  children: ReactNode;
};

export function Card({ title, tone = "board", children }: CardProps) {
  return (
    <article className={`${styles.card} ${styles[tone]}`}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.body}>{children}</div>
    </article>
  );
}
