"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useMyPlayers } from "@/hooks/use-my-players";
import { apiFetch } from "@/lib/api-fetch";
import { playerPath } from "@/lib/player";
import { isValidChessComUsername } from "@/lib/username";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./account-panel.module.css";

/** AUTH-02: a saved list of Chess.com usernames for quick links. Saving checks the account exists. */
export function AccountPanel({ initialUsername }: { initialUsername: string }) {
  const fieldId = useId();
  const { players, reload } = useMyPlayers();
  const [username, setUsername] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    setSaved(null);
    if (!isValidChessComUsername(name)) {
      setError(messages.usernameInvalid);
      return;
    }
    await run(`me/players/${encodeURIComponent(name)}/save`, () => {
      setSaved(name.toLowerCase());
      setUsername("");
    });
  }

  async function remove(name: string) {
    setSaved(null);
    await run(`me/players/${encodeURIComponent(name)}/remove`, () => undefined);
  }

  async function run(path: string, onDone: () => void) {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(path, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
        setError(typeof body?.detail === "string" ? body.detail : messages.analyzeUnreachable);
        return;
      }
      onDone();
      reload();
    } catch {
      setError(messages.analyzeUnreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.block} aria-labelledby="my-accounts">
        <h2 id="my-accounts">{messages.accountListHeading}</h2>
        {players === null ? <p role="status">{messages.accountLoading}</p> : null}
        {players !== null && players.length === 0 ? <p>{messages.accountNone}</p> : null}
        {players && players.length > 0 ? (
          <ul className={styles.list}>
            {players.map((name) => (
              <li key={name}>
                <span className={styles.name}>{name}</span>
                <Link href={playerPath(name)}>{messages.accountOpen}</Link>
                <Button
                  variant="tertiary"
                  onClick={() => void remove(name)}
                  disabled={busy}
                  aria-label={fill(messages.accountRemoveLabel, { name })}
                >
                  {messages.accountRemove}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.block} aria-labelledby="add-account">
        <h2 id="add-account">{messages.accountAddHeading}</h2>
        <p className={styles.lead}>{messages.accountAddLead}</p>
        <form className={styles.form} onSubmit={(event) => void save(event)} noValidate>
          <TextField
            id={fieldId}
            label={messages.usernameLabel}
            hint={messages.usernameHint}
            value={username}
            onChange={(value) => {
              setUsername(value);
              setError(null);
            }}
          />
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {messages.accountSave}
          </Button>
        </form>
        <div aria-live="polite">
          {saved ? (
            <p className={styles.done}>
              <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
              {fill(messages.accountSaved, { name: saved })}{" "}
              <Link href={playerPath(saved)}>{messages.accountOpen}</Link>
            </p>
          ) : null}
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
