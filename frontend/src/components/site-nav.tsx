"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AccountMenu } from "@/components/account-menu";
import { useSignIn } from "@/components/sign-in-dialog";
import { UsernameForm } from "@/components/username-form";
import { useMyPlayers } from "@/hooks/use-my-players";
import { gamesPath, playerNameFromSegment, playerPath } from "@/lib/player";
import { messages } from "@/messages/en";
import styles from "./site-nav.module.css";

type NavItem = { href: string; label: string; current: boolean };

/**
 * Primary navigation (NAV-01). My games and Puzzles need a player: the one in the URL, or the first
 * username this user saved (NAV-02, AUTH-02). The compact search shows off the landing page (NAV-03).
 */
export function SiteNav() {
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  const params = useParams<{ username?: string }>();
  const { status } = useSession();
  const { players } = useMyPlayers();
  const fromUrl = typeof params.username === "string" ? playerNameFromSegment(params.username) : null;
  const player = fromUrl ?? players?.[0] ?? null;
  const signedIn = status === "authenticated";
  const openSignIn = useSignIn();
  const here = `${pathname}${view ? `?view=${view}` : ""}`;

  const dashboard = player ? playerPath(player) : null;
  const items: NavItem[] = [
    {
      href: dashboard ?? "/",
      label: messages.navAnalyze,
      current: pathname === "/" || (pathname === dashboard && view !== "puzzles"),
    },
  ];
  if (player) {
    items.push(
      { href: gamesPath(player), label: messages.navGames, current: pathname === gamesPath(player) },
      { href: playerPath(player, "puzzles"), label: messages.navPuzzles, current: pathname === dashboard && view === "puzzles" },
    );
  }
  items.push({ href: "/learn", label: messages.navLearn, current: pathname.startsWith("/learn") });

  return (
    <>
      <nav className={styles.nav} aria-label={messages.navLabel}>
        <ul>
          {items.map((item) => (
            <li key={item.label}>
              <Link href={item.href} aria-current={item.current ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {pathname === "/" ? null : <UsernameForm variant="compact" />}
      <div className={styles.account}>
        {signedIn ? <AccountMenu /> : null}
        {status === "unauthenticated" ? (
          // A real link, so it still works without JavaScript; with it, the dialog opens in place.
          <Link
            href={`/signin?callbackUrl=${encodeURIComponent(here)}`}
            className={styles.signIn}
            onClick={(event) => {
              event.preventDefault();
              openSignIn(here);
            }}
          >
            {messages.signIn}
          </Link>
        ) : null}
      </div>
    </>
  );
}
