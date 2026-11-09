import type { Metadata } from "next";
import { AccountPanel } from "@/components/account-panel";
import { playerNameFromSegment } from "@/lib/player";
import { messages } from "@/messages/en";
import styles from "../learn/learn.module.css";

export const metadata: Metadata = { title: messages.accountTitle };

type Props = { searchParams: Promise<{ username?: string }> };

/** AUTH-02: the signed-in user's saved Chess.com usernames, and adding one. Signed out users are sent to /signin. */
export default async function AccountPage({ searchParams }: Props) {
  const { username } = await searchParams;
  const initial = username ? (playerNameFromSegment(username) ?? "") : "";
  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.head}>
        <h1>{messages.accountTitle}</h1>
        <p className={styles.lead}>{messages.accountLead}</p>
      </div>
      <AccountPanel initialUsername={initial} />
    </div>
  );
}
