import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

/** AUTH-01: who is signed in. Only "<provider>:<account id>" leaves this file; no email or picture is kept. */
const USER_KEY = /^(?:github|google):[A-Za-z0-9_-]{1,64}$/;

export type SignInProvider = { id: "github" | "google"; name: string };

export function configuredProviders(): SignInProvider[] {
  const providers: SignInProvider[] = [];
  if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
    providers.push({ id: "github", name: "GitHub" });
  }
  if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
    providers.push({ id: "google", name: "Google" });
  }
  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [GitHubProvider({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET })]
      : []),
    ...(process.env.GOOGLE_ID && process.env.GOOGLE_SECRET
      ? [GoogleProvider({ clientId: process.env.GOOGLE_ID, clientSecret: process.env.GOOGLE_SECRET })]
      : []),
  ],
  session: { strategy: "jwt", maxAge: 14 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  callbacks: {
    jwt({ token, account }) {
      if (account) {
        token.userKey = `${account.provider}:${account.providerAccountId}`;
      }
      delete token.email;
      delete token.picture;
      return token;
    },
    session({ session, token }) {
      return {
        expires: session.expires,
        user: { name: session.user?.name ?? null },
        userKey: typeof token.userKey === "string" ? token.userKey : undefined,
      };
    },
  },
};

export function isUserKey(value: unknown): value is string {
  return typeof value === "string" && USER_KEY.test(value);
}

export async function currentUserKey(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return isUserKey(session?.userKey) ? session.userKey : null;
}
