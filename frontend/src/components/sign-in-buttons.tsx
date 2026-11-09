"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/button";
import { ProviderIcon } from "@/components/provider-icon";
import type { SignInProvider } from "@/lib/auth";
import { afterSignIn } from "@/lib/safe-redirect";
import { fill } from "@/lib/weakness-copy";
import { messages } from "@/messages/en";
import styles from "./sign-in-buttons.module.css";

export function SignInButtons({ providers, callbackUrl }: { providers: SignInProvider[]; callbackUrl: string }) {
  return (
    <div className={styles.buttons}>
      {providers.map((provider) => (
        <Button key={provider.id} onClick={() => void signIn(provider.id, { callbackUrl: afterSignIn(callbackUrl) })}>
          <ProviderIcon provider={provider.id} />
          {fill(messages.signInWith, { provider: provider.name })}
        </Button>
      ))}
    </div>
  );
}
