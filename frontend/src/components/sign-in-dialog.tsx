"use client";

import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";
import { getProviders, signIn } from "next-auth/react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/button";
import { ProviderIcon } from "@/components/provider-icon";
import { afterSignIn, safeCallbackPath } from "@/lib/safe-redirect";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./sign-in-dialog.module.css";

type Provider = { id: string; name: string };
type OpenSignIn = (callbackUrl: string) => void;

const SignInContext = createContext<OpenSignIn | null>(null);

/**
 * AUTH-01: one sign-in dialog for the whole site. Built on the native <dialog>: it traps focus while open,
 * closes on Escape, makes the page behind it inert, and hands focus back to the button that opened it.
 * The /signin page stays as the fallback for links and redirects.
 */
export function SignInDialogProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [callbackUrl, setCallbackUrl] = useState("/account");
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [failed, setFailed] = useState(false);

  const loading = useRef(false);

  // Load the provider list the first time the dialog opens, not on every page.
  const loadProviders = useCallback(() => {
    if (loading.current) {
      return;
    }
    loading.current = true;
    getProviders()
      .then((found) => setProviders(Object.values(found ?? {}).map(({ id, name }) => ({ id, name }))))
      .catch(() => {
        loading.current = false;
        setFailed(true);
        setProviders([]);
      });
  }, []);

  const open = useCallback<OpenSignIn>(
    (target) => {
      setCallbackUrl(safeCallbackPath(target));
      setFailed(false);
      dialogRef.current?.showModal();
      loadProviders();
    },
    [loadProviders],
  );

  function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    <SignInContext.Provider value={open}>
      {children}
      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} onClick={closeOnBackdrop}>
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 id={titleId}>{messages.signInTitle}</h2>
            <button
              type="button"
              className={styles.close}
              aria-label={messages.signInClose}
              onClick={() => dialogRef.current?.close()}
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <p className={styles.lead}>{messages.signInLead}</p>
          {providers === null ? (
            <p role="status" className={styles.quiet}>
              {messages.signInLoading}
            </p>
          ) : null}
          {providers !== null && providers.length > 0 ? (
            <div className={styles.buttons}>
              {providers.map((provider) => (
                <Button key={provider.id} onClick={() => void signIn(provider.id, { callbackUrl: afterSignIn(callbackUrl) })}>
                  <ProviderIcon provider={provider.id} />
                  {fill(messages.signInWith, { provider: provider.name })}
                </Button>
              ))}
            </div>
          ) : null}
          {providers !== null && providers.length === 0 ? (
            <p role="alert" className={styles.error}>
              {failed ? messages.analyzeUnreachable : messages.signInUnavailable}
            </p>
          ) : null}
          <p className={styles.note}>
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            {messages.signInPrivacy}
          </p>
        </div>
      </dialog>
    </SignInContext.Provider>
  );
}

/** Opens the sign-in dialog, then returns to callbackUrl. Without the provider, falls back to the /signin page. */
export function useSignIn(): OpenSignIn {
  const open = useContext(SignInContext);
  return useCallback<OpenSignIn>(
    (callbackUrl) => {
      if (open) {
        open(callbackUrl);
        return;
      }
      window.location.assign(`/signin?callbackUrl=${encodeURIComponent(safeCallbackPath(callbackUrl))}`);
    },
    [open],
  );
}
