import type { Metadata } from "next";
import { messages } from "@/messages/en";

export const metadata: Metadata = {
  title: messages.privacyTitle,
};

export default function PrivacyPage() {
  return (
    <article className="shell prose page-pad">
      <h1>{messages.privacyTitle}</h1>
      <p>Last updated 7 November 2026.</p>

      <h2>Signing in</h2>
      <p>
        You sign in with GitHub or Google. Caissa keeps only the id that service gives your account (for example
        “github:12345”) to recognise you. It does not store your email address or picture, and it never asks for
        your Chess.com password.
      </p>
      <p>
        Your session is kept in one encrypted, http-only cookie that ends after 14 days or when you sign out. Caissa
        does not use advertising or tracking cookies.
      </p>

      <h2>Your Chess.com accounts</h2>
      <p>
        When you save a Chess.com username, Caissa reads that player&apos;s public profile once to check the account
        exists, then stores the username with your sign-in id as a quick link. You can remove it on your account page at
        any time.
      </p>

      <h2>Game data</h2>
      <p>
        Caissa downloads the public games of the Chess.com usernames you look up from the Chess.com public API and
        stores them, with the engine analysis, to build the heatmap, report, puzzles, and lessons. These games are
        already public on Chess.com, so any signed-in Caissa user can see the analysis of any player.
      </p>

      <h2>Your progress</h2>
      <p>
        When you answer a puzzle, finish a lesson, or review a game, Caissa stores what it was, the result, and the
        time, with your sign-in id. Your XP, streak, badges, and puzzle schedule are worked out from that. Only you can
        see them; there are no leaderboards. Reset progress on your progress page deletes all of it.
      </p>

      <h2>On this device</h2>
      <p>
        Your color theme and sound setting are saved in local storage on this device only. The last report you opened
        is kept in this browser tab so it shows at once when you come back. In the installed app, pages and reports you
        opened are kept for offline use. Signing out deletes both.
      </p>
    </article>
  );
}
