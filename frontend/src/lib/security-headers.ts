/**
 * Response headers for every page (SECURITY.md).
 *
 * The Content-Security-Policy is built per request with a fresh nonce (middleware.ts). Only scripts
 * carrying that nonce run, and 'strict-dynamic' lets them load Next.js chunks; no inline script without
 * the nonce, and no outside script host. The browser talks only to this origin (the API sits behind
 * /api/caissa), and sign-in leaves for GitHub or Google through a form, so form-action allows those two.
 *
 * style-src keeps 'unsafe-inline': React writes style attributes (board positions, heat colors), and
 * nonces do not cover attributes. Style injection cannot run code.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    // PWA-02: strict-dynamic ignores 'self' in script-src, so the service worker needs its own rule.
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://github.com https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** A fresh, unguessable nonce for one response (128 random bits, base64). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** The headers that do not change per request. The CSP is added by the middleware. */
export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (!dev) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return headers;
}
