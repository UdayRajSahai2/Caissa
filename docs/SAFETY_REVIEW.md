# SAFETY_REVIEW.md — Security review

You are acting as a **senior cybersecurity engineer** reviewing Caissa (frontend + backend).

Find flaws that lead to abuse, data leak, SSRF, injection, secret exposure, or unsafe defaults. Prefer concrete findings with severity and a fix direction.

**Do not overengineer.** Recommend controls that fit a public-username, no-login portfolio app. Do not invent a full IAM platform unless the user asks for auth. Align with what [`../SECURITY.md`](../SECURITY.md) already ships, and call out deferred items honestly.

---

## When to use this doc

- New or changed API routes, jobs, or adapters
- Username / URL / PGN / query handling
- CORS, rate limits, headers, cookies, env vars
- Dependency adds or upgrades
- Deploy / Docker / CI secrets
- When the user asks for a security or safety review

Also read [`../SECURITY.md`](../SECURITY.md) and [`../AGENTS.md`](../AGENTS.md).

---

## Threat model (current product)

| Asset | Risk if abused |
| --- | --- |
| Chess.com username intake | Path injection into URLs, log noise, scraping amplification |
| Outbound Chess.com HTTP | SSRF via malicious archive URLs |
| Analyze / score jobs | CPU burn (Stockfish), queue flooding |
| Postgres / Redis | Data tampering if exposed beyond localhost |
| Frontend origin | CSRF-like cross-origin job triggers; XSS if HTML is ever injected |
| Secrets in `.env` | Credential leak via git or client bundles |

There is **no login** today (constitution). Do not assume session auth exists. When auth is added later, re-run this review for CSRF, session fixation, and IDOR.

---

## Checklist — backend

- [ ] All path/query/body inputs validated; invalid values rejected with fixed messages (no raw echo)
- [ ] Username rules enforced before URL build (3–25, `[A-Za-z0-9_-]`)
- [ ] Outbound HTTP: HTTPS only, allowlisted host (`api.chess.com`), no redirect following, `trust_env=False` (or equivalent)
- [ ] No SSRF via user-controlled hosts, ports, or schemes
- [ ] Stockfish only in Celery workers; request handlers do not run the engine
- [ ] Rate limits remain on expensive routes; 429 includes safe headers
- [ ] CORS allowlist unchanged unless deploy origins are intentionally updated
- [ ] Security headers still set (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control` as configured)
- [ ] SQL via ORM / bound parameters only
- [ ] Responses are Pydantic-shaped; PGN and secrets never in JSON or logs
- [ ] Config from env; no passwords in source; `.env` gitignored
- [ ] Job idempotency: duplicate score requests do not spawn duplicate heavy work when a job is active

## Checklist — frontend

- [ ] No secrets in `NEXT_PUBLIC_*` or client bundles
- [ ] Username validated before calling the API
- [ ] User/opponent text rendered as text nodes — never `dangerouslySetInnerHTML` without a vetted sanitizer
- [ ] API base URL from config; no open redirects built from query params
- [ ] Error UI does not dump raw server bodies that might contain internals

## Checklist — deps and ops

- [ ] New packages justified, pinned, maintained; run `pip-audit` / `npm audit` when adding
- [ ] CI audit workflows still meaningful after lockfile changes
- [ ] Compose ports bound to `127.0.0.1` for local Postgres/Redis
- [ ] Diagnostic scripts that print PGN stay out of production request paths

---

## Severity guide

| Severity | Example |
| --- | --- |
| Critical | Remote code exec, unrestricted SSRF, secret in repo |
| High | Unauthenticated expensive job flood without limit; SQL injection; stored XSS |
| Medium | Missing validation that enables probing; overly wide CORS in production |
| Low | Verbose error text; missing hardening header on a static page |
| Info | Defense-in-depth idea; deferred auth note |

---

## Out of scope (unless asked)

- Full penetration test report formatting
- Inventing login/password storage “while we are here”
- Changing Chess.com’s security model
- Claiming SOC2 / ISO compliance

---

## Review output

For each finding:

1. **Title** and **severity**
2. **Where** (file / route)
3. **Impact**
4. **How to reproduce** (short)
5. **Fix** (smallest safe change)
6. **References** to `SECURITY.md` or OWASP category when useful

End with:

- **Blockers** before merge
- **Follow-ups** that can wait (and say so)

Never recommend “disable the rate limiter” or “trust `X-Forwarded-For` blindly” as a convenience fix.
