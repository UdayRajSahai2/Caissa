"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Trophy, UserRound } from "lucide-react";
import { forgetReports } from "@/lib/library-report";
import { clearOfflineCache } from "@/lib/offline";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./account-menu.module.css";

/** Two letters from a display name: "Uday Raj" gives "UR"; nothing usable gives null. */
export function initials(name: string | null | undefined): string | null {
  const letters = (name ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/\p{L}|\p{N}/u)?.[0] ?? "")
    .filter(Boolean);
  if (letters.length === 0) {
    return null;
  }
  return (letters.length === 1 ? letters[0] : `${letters[0]}${letters[letters.length - 1]}`)?.toUpperCase() ?? null;
}

/**
 * The signed-in user's avatar (initials, since Caissa keeps no picture). A disclosure button opens a small
 * panel with the account page and Sign out. Escape or a click outside closes it and returns focus to the avatar.
 */
export function AccountMenu() {
  const { data } = useSession();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const name = data?.user?.name ?? null;
  const letters = initials(name);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatar}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={name ? fill(messages.accountMenuFor, { name }) : messages.accountMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {letters ? <span aria-hidden="true">{letters}</span> : <UserRound size={20} strokeWidth={1.75} aria-hidden="true" />}
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        {name ? <p className={styles.name}>{name}</p> : null}
        <p className={styles.hint}>{messages.accountMenuHint}</p>
        <ul className={styles.items}>
          <li>
            <Link href="/progress" className={styles.item} onClick={() => setOpen(false)}>
              <Trophy size={18} strokeWidth={1.75} aria-hidden="true" />
              {messages.progressTitle}
            </Link>
          </li>
          <li>
            <Link href="/account" className={styles.item} onClick={() => setOpen(false)}>
              <UserRound size={18} strokeWidth={1.75} aria-hidden="true" />
              {messages.accountMenuAccounts}
            </Link>
          </li>
          <li>
            <button type="button" className={styles.item} onClick={() => {
                forgetReports();
                clearOfflineCache();
                void signOut({ callbackUrl: "/" });
              }}>
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
              {messages.signOut}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
