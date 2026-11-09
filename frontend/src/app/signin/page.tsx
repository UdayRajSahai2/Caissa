import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { SignInButtons } from "@/components/sign-in-buttons";
import { configuredProviders } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { messages } from "@/messages/en";
import styles from "./signin.module.css";

export const metadata: Metadata = { title: messages.signInTitle };

type Props = { searchParams: Promise<{ callbackUrl?: string; error?: string }> };

/** AUTH-01: sign in with GitHub or Google. The return path is checked so it cannot leave this site. */
export default async function SignInPage({ searchParams }: Props) {
  const { callbackUrl, error } = await searchParams;
  const providers = configuredProviders();
  return (
    <div className={`shell ${styles.page}`}>
      <div className={styles.card}>
        <h1>{messages.signInTitle}</h1>
        <p className={styles.lead}>{messages.signInLead}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {messages.signInFailed}
          </p>
        ) : null}
        {providers.length > 0 ? (
          <SignInButtons providers={providers} callbackUrl={safeCallbackPath(callbackUrl)} />
        ) : (
          <p className={styles.error} role="alert">
            {messages.signInUnavailable}
          </p>
        )}
        <p className={styles.note}>
          <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
          {messages.signInPrivacy}
        </p>
      </div>
    </div>
  );
}
