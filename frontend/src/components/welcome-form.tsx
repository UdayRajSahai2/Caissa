"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { apiFetch } from "@/lib/api-fetch";
import { playerPath } from "@/lib/player";
import { isValidChessComUsername } from "@/lib/username";
import { messages } from "@/messages/en";
import styles from "./welcome-form.module.css";

/**
 * AUTH-06: the one onboarding question. Saving checks the account exists on Chess.com (AUTH-02); then the
 * user goes where they were heading, or to their own analysis.
 */
export function WelcomeForm({ initialUsername, next }: { initialUsername: string; next: string | null }) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    if (!isValidChessComUsername(name)) {
      setError(messages.usernameInvalid);
      formRef.current?.querySelector("input")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(`me/players/${encodeURIComponent(name)}/save`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
        setError(typeof body?.detail === "string" ? body.detail : messages.analyzeUnreachable);
        formRef.current?.querySelector("input")?.focus();
        return;
      }
      // A full load, so the header and every page see the newly saved username.
      window.location.assign(next && next.startsWith("/player/") ? next : playerPath(name));
    } catch {
      setError(messages.analyzeUnreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <TextField
        id={fieldId}
        label={messages.welcomeLabel}
        hint={messages.usernameHint}
        value={username}
        onChange={(value) => {
          setUsername(value);
          setError(null);
        }}
      />
      {error ? (
        <p className={styles.error} role="alert">
          <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? messages.welcomeChecking : messages.welcomeContinue}
        <ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </Button>
      <p className={styles.note}>{messages.welcomeNote}</p>
    </form>
  );
}
