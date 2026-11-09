"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search } from "lucide-react";
import { Button } from "@/components/button";
import { useSignIn } from "@/components/sign-in-dialog";
import { TextField } from "@/components/text-field";
import { playerPath } from "@/lib/player";
import { isValidChessComUsername } from "@/lib/username";
import { messages } from "@/messages/en";
import styles from "./username-form.module.css";

/**
 * Checks the name (ING-01, ING-02) and opens that player's analysis page (NAV-04).
 * The page itself downloads and refreshes games, so this answers at once.
 * "hero" is the large landing form; "compact" is the header search (NAV-03).
 */
export function UsernameForm({ variant = "hero" }: { variant?: "hero" | "compact" }) {
  const router = useRouter();
  const fieldId = useId();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, startOpening] = useTransition();
  const { status } = useSession();
  const openSignIn = useSignIn();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = username.trim();
    if (!isValidChessComUsername(value)) {
      setError(messages.usernameInvalid);
      // Put the cursor back in the field that needs fixing.
      document.getElementById(fieldId)?.focus();
      return;
    }
    setError(null);
    if (status === "unauthenticated") {
      // AUTH-01: sign in first, then land on this player's page.
      openSignIn(playerPath(value));
      return;
    }
    startOpening(() => router.push(playerPath(value)));
  }

  function change(value: string) {
    setUsername(value);
    setError(null);
  }

  if (variant === "compact") {
    const errorId = `${fieldId}-error`;
    return (
      <form className={styles.compact} role="search" aria-label={messages.headerSearchLabel} onSubmit={onSubmit} noValidate>
        <label htmlFor={fieldId} className="visually-hidden">
          {messages.usernameLabel}
        </label>
        <input
          id={fieldId}
          name="username"
          className={styles.compactInput}
          value={username}
          placeholder={messages.headerSearchPlaceholder}
          onChange={(event) => change(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={styles.compactButton} aria-busy={opening}>
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">{messages.headerSearchButton}</span>
        </button>
        {error ? (
          <p id={errorId} className={styles.compactError} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <TextField
        id={fieldId}
        label={messages.usernameLabel}
        hint={messages.usernameHint}
        name="username"
        error={error}
        value={username}
        onChange={change}
      />
      <Button type="submit" className={styles.submit} disabled={opening} aria-busy={opening}>
        <Search size={20} strokeWidth={1.75} aria-hidden="true" />
        {messages.analyze}
      </Button>
    </form>
  );
}
