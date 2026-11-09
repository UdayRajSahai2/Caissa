import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeForm } from "@/components/welcome-form";
import { playerNameFromSegment, playerPath } from "@/lib/player";
import { savedPlayers } from "@/lib/onboarding";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { messages } from "@/messages/en";
import styles from "../signin/signin.module.css";

export const metadata: Metadata = { title: messages.welcomeTitle };

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * AUTH-06: right after sign-in, ask once for the user's Chess.com username. A user who already saved one
 * goes straight on. Signed-out visitors are sent to /signin by the middleware.
 */
export default async function WelcomePage({ searchParams }: Props) {
  const { next } = await searchParams;
  const target = next ? safeCallbackPath(next) : null;
  const players = await savedPlayers();
  const first = players?.[0];
  if (first) {
    redirect(target && !target.startsWith("/welcome") ? target : playerPath(first));
  }
  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.card}>
        <p className={styles.step}>{messages.welcomeStep}</p>
        <h1>{messages.welcomeTitle}</h1>
        <p className={styles.lead}>{messages.welcomeLead}</p>
        <WelcomeForm initialUsername={suggestedName(target)} next={target} />
      </div>
    </div>
  );
}

/** When the user was heading to a player's page, offer that name; they can change it. */
function suggestedName(target: string | null): string {
  const match = target ? /^\/player\/([^/?#]+)/.exec(target) : null;
  return match?.[1] ? (playerNameFromSegment(match[1]) ?? "") : "";
}
