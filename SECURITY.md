# Security

Caissa is a portfolio project. This file records the controls that exist in the code today, and the ones that wait for a public deploy.

## In place

### Sign-in and saved players (AUTH-01 to AUTH-04)

- Users sign in with GitHub or Google through Auth.js (`next-auth` 4.24.15, pinned). The session is an encrypted, http-only cookie (`SameSite=Lax`, 14 days). Caissa keeps only the provider account id (`github:<id>` or `google:<id>`); the email and picture are dropped from the token. No passwords are stored anywhere.
- Any signed-in user may analyze any public Chess.com username; the games are public on Chess.com already. There is no ownership check. Saving a username to a user's list reads that player's public profile once through the Chess.com adapter, with the same allowlist as archives, to check the account exists. The list is quick links, not a permission.
- Browsers never call the API. They call `/api/caissa/*` on the Next.js server, which forwards only an allowlist of paths and query keys (`src/lib/proxy-path.ts`), for a signed-in user, adding `X-Caissa-Internal` (a shared secret, compared in constant time) and `X-Caissa-User`. The API refuses every analysis and account route without the secret (`401`). An empty secret refuses everything.
- A `POST` through the proxy must carry this site's `Origin` (`403` otherwise), beside the `SameSite=Lax` session cookie.
- `/player/*` and `/account` pages require a session (Next.js middleware). Games and jobs are not tied to a user; they hold only public Chess.com data, and job ids are random UUIDs.
- After sign-in, the return path must be a path on this site (`src/lib/safe-redirect.ts`); other sites are never a redirect target.

### Bot check (AUTH-05)

- Calls that start work (every `POST` through the proxy, and a player sync that can queue a download) need a clearance cookie. Without it the proxy answers `428` and the browser solves a proof-of-work challenge invisibly (`src/lib/api-fetch.ts`): SHA-256 with 14 leading zero bits by default (`CAISSA_BOT_CHECK_BITS`), measured at 50–150 ms in a browser.
- A challenge is HMAC-signed for one user, expires in 5 minutes, and is accepted once. The answer earns `caissa-clearance`: http-only, `SameSite=Lax`, `Path=/api`, `Secure` in production, signed for that user, valid one hour (`src/lib/bot-check-server.ts`). Signatures are compared in constant time.
- There is no puzzle to read or click (WCAG 2.2 SC 3.3.8), no third-party service, and no tracking. A browser without WebCrypto (an insecure, non-localhost http address) cannot pass; production runs on https.

### Input, outbound requests, and limits

- Chess.com usernames are accepted only when they are 3–25 characters of letters, digits, `_`, or `-`. That check runs before a username is put in a URL. The API responds with a fixed message and does not echo the rejected value. Invalid names get `422` before any Chess.com request.
- Chess.com URLs are requested only when the scheme is `https`, the host is exactly `api.chess.com`, the port is 443, and the path is that player's profile or one of their archives. Redirects are not followed. `HTTP_PROXY` from the environment is ignored (`trust_env=False`).
- Downloads, scoring, and saving a username are limited per signed-in user (5/minute) and globally (60/minute). Limits live in Redis, so every API process shares them (`RATE_LIMIT_BACKEND=redis`; tests use `memory`). The response is `429` with `Retry-After`. A second score request while that game's job is still open returns the same job and does not start Stockfish again. Per-game score claims expire after 15 minutes.
- Responses use Pydantic models. PGN text is not returned and is not written to the API log. The game review (REV) returns each move's SAN, UCI, FEN, eval, and clock, never the PGN.
- Progress (GAM-06): the API stores only the user key, the kind of activity, a reference checked against a fixed pattern (puzzle `game-ply`, lesson slug, or game id), the Chess.com username and phase for puzzles, the result, and the time. Rejected values get `422` with a fixed message. A user can only read and delete their own rows (`POST /me/progress/reset`). Activity writes have their own per-user limit (60/minute, `RATE_LIMIT_ACTIVITY_REQUESTS`). There are no leaderboards, so no user's progress is shown to anyone else.
- The proxy forwards each query key only with values that match that key's own pattern (`src/lib/proxy-path.ts`).

### Headers

- The website sends a per-request `Content-Security-Policy` from `src/middleware.ts`: scripts run only with that response's nonce (`'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'`, no outside script host), `connect-src 'self'`, `frame-ancestors 'none'`, `worker-src 'self'` and `manifest-src 'self'` (PWA-02; `'strict-dynamic'` ignores `'self'` in `script-src`, so the service worker needs its own rule), and `form-action` limited to this site, GitHub, and Google. Every page renders per request so each one carries its own nonce. It also sends `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and in production `Strict-Transport-Security` (`src/lib/security-headers.ts`).
- The API sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`, `Permissions-Policy`, and `Cache-Control: no-store`.

### Secrets and dependencies

- Configuration comes from the environment, `.env` (API), and `frontend/.env.local` (website). Both files are gitignored. Secrets: `INTERNAL_TOKEN` / `CAISSA_INTERNAL_TOKEN` (the same value), `NEXTAUTH_SECRET`, and the GitHub and Google OAuth secrets. None uses a `NEXT_PUBLIC_` prefix, so none reaches the browser.
- `.github/workflows/dependency-audit.yml` runs `pip-audit` on the backend dependencies. `npm audit --omit=dev` reports 0 vulnerabilities (2026-11-08): Next.js 15.5.29 closes a critical advisory, and an npm `overrides` entry pins the PostCSS inside Next.js to 8.5.32 (same major version) to close the PostCSS advisories.

## Known limits

- `style-src` keeps `'unsafe-inline'`: React writes style attributes (board squares, heat colors) and nonces do not cover attributes. Injected styles cannot run code.
- The proof-of-work slows automated use; it does not stop a determined attacker with real accounts. Sign-in and per-user rate limits remain the main controls.
- Used challenge ids are remembered in the memory of each Next.js process. With several processes, one answer could earn clearance once per process within its 5 minutes, still bound to the same user.
- Anyone with a GitHub or Google account can sign in and analyze any public Chess.com player. One person with many accounts gets more rate-limit budget, still capped by the global limit.
- The production service worker (`public/sw.js`) keeps the last library and game answers, and pages, in the browser cache for offline use. Sign-out clears them, and the last reports in `sessionStorage`. A session that simply expires leaves them until the next sign-out or a new worker version. Sign-in, the bot check, progress, jobs, and every `POST` are never cached.
- Progress is self-reported by the browser (a user could record lessons they did not read). It only changes that user's own private XP and badges.

## Before a public deploy

- Set long random values for `INTERNAL_TOKEN`/`CAISSA_INTERNAL_TOKEN` and `NEXTAUTH_SECRET`, and set `NEXTAUTH_URL` to the public https address.
- Create the OAuth apps with the production callback URLs (`https://<site>/api/auth/callback/github` and `.../google`).
- Keep the API on a private network or behind the shared secret only; it needs no public CORS origin, since browsers do not call it.
- HTTPS is the host's job (Vercel, Railway, Render, or similar). Confirm the deploy redirects HTTP to HTTPS.
- Container image scanning, once the API image exists. Add `npm audit` to CI.

## Local diagnostic

`backend/scripts/fetch_archives.py` prints the first eight lines of one PGN in the terminal so a developer can see that the download looks like a game. That script is not the API. Do not point production logs at it.
