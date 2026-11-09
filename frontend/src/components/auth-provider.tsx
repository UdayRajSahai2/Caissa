"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { ProgressProvider } from "@/components/progress-provider";
import { SignInDialogProvider } from "@/components/sign-in-dialog";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SignInDialogProvider>
        <ProgressProvider>{children}</ProgressProvider>
      </SignInDialogProvider>
    </SessionProvider>
  );
}
