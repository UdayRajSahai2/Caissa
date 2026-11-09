/** Where to go after signing in: only a path on this site, never another site (no open redirect). */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/account";
  }
  return value;
}

/** AUTH-06: after sign-in, go through the welcome step, which forwards at once if a username is saved. */
export function afterSignIn(callbackUrl: string): string {
  const next = safeCallbackPath(callbackUrl);
  return next.startsWith("/welcome") ? next : `/welcome?next=${encodeURIComponent(next)}`;
}
