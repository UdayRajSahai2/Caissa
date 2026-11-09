# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Copilot, Codex, etc.) working in this repository.

**Read this file fully before writing or changing code.** Then open the matching guides under [`docs/`](docs/README.md). If a rule here conflicts with a request, tell the user before proceeding.

---

## Project overview

**Caissa** is a free, open-source Chess.com game-review app. A player signs in with GitHub or Google, then enters a public Chess.com username (never a Chess.com password). The app downloads public games, scores blunders with Stockfish in Celery workers, and shows:

- a library-wide **blunder heatmap**
- a **weakness report**
- **puzzles** from the player's own mistakes
- per-game review notes

The living product and design rules live in [`game-insights-spec.md`](game-insights-spec.md). Security controls that already exist are listed in [`SECURITY.md`](SECURITY.md).

---

## Required reading before coding

Role guides live under [`docs/`](docs/README.md). Each one opens with **You are a …** — adopt that persona for the task ([`docs/ROLES.md`](docs/ROLES.md)).

| When | Read |
| --- | --- |
| Every change | This file |
| Cross-stack design, new routes/jobs/tables, layering decisions | [`docs/SOFTWARE_ARCHITECT.md`](docs/SOFTWARE_ARCHITECT.md) — fullstack software architect |
| Any feature or bugfix | [`docs/QC.md`](docs/QC.md) — senior QA |
| After writing or reviewing code | [`docs/CODE_QUALITY.md`](docs/CODE_QUALITY.md) — senior engineer (quality) |
| UI, API shape, or design-system work | [`docs/CRAFT_REVIEW.md`](docs/CRAFT_REVIEW.md) — senior product / craft engineer |
| Auth, input, network, secrets, deploy, or new endpoints | [`docs/SAFETY_REVIEW.md`](docs/SAFETY_REVIEW.md) — senior cybersecurity engineer — and [`SECURITY.md`](SECURITY.md) |
| Spec or requirement IDs | [`game-insights-spec.md`](game-insights-spec.md) |

Do not invent product behavior that is not in the spec. If a request has no requirement ID, say so and propose the spec change first.

---

## Tech stack

### Frontend (`frontend/`)

- Next.js 15 (App Router), React 19, TypeScript (strict)
- CSS Modules + design tokens in `frontend/src/styles/tokens.css`
- Vitest + React Testing Library
- Playwright + axe for accessibility smoke tests
- No GraphQL. REST against the FastAPI backend (`NEXT_PUBLIC_API_URL`)

### Backend (`backend/`)

- Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic
- Celery + Redis for jobs; Stockfish only inside workers (never in a request)
- PostgreSQL (local via `compose.yml`)
- pytest, Ruff, mypy / pip-audit in CI

Do not swap stack pieces without updating `game-insights-spec.md` first.

---

## Development philosophy

1. Understand the request and the surrounding code first.
2. Keep the implementation simple.
3. **Do not overengineer.** Prefer readable, maintainable code over clever abstractions, premature frameworks, or “enterprise” layers that this app does not need.
4. Build the smallest correct change. Do not refactor unrelated code.
5. Reuse what exists before creating a new component, hook, service, or package.
6. Never guess APIs, fields, or library behavior — check the source or docs.
7. No dead code: no commented-out blocks, unused imports, or leftover `console.log` / `print` debug.
8. Finish only when lint, typecheck, and tests for the touched area pass.

---

## Decision making

- If something is unclear, ask. Prefer a short clarifying question over a wrong guess.
- If a new dependency would help a lot: recommend it, explain why, and **wait for approval** before installing.
- Prefer the platform and packages already in the repo. Pin versions. Do not upgrade majors as a side effect.
- Never commit until the user asks. Never force-push shared branches. Never skip hooks unless asked.
- Name local plan docs with a `-plan.md` suffix so they stay out of git. Do not commit plan docs.

---

## Folder structure

```txt
frontend/
  src/
    app/              # routes, layouts, globals
    components/       # UI (co-locate .module.css and *.test.tsx)
    hooks/
    lib/              # pure helpers, API clients, heat/review maths
    messages/         # user-facing copy (en.ts)
    styles/           # tokens.css
    tests/            # shared test setup
  e2e/                # Playwright
backend/
  app/
    api/              # routes, deps, schemas, rate limit
    adapters/         # Chess.com HTTP client
    core/             # settings
    db/               # models, session, repository
    domain/           # username, blunder, position (pure)
    engine/           # Stockfish wrapper
    jobs/ services/ worker/ cache/
  tests/
docs/                 # agent review guides (this folder)
compose.yml           # Postgres + Redis for local
```

Dependency direction:

- Frontend: `app` → `components` → `hooks` / `lib`. Lower layers never import from `app`.
- Backend: routes → services → domain / adapters / db. Keep route handlers thin.

---

## Frontend rules

- One component per file. Name matches the export (`BlunderBoard.tsx`).
- Styles only in `*.module.css` (or tokens). No large inline `style={{}}` objects. No new hard-coded hex in components — use CSS variables from `tokens.css`.
- Copy goes through `messages/en.ts`, not string soup in JSX.
- Presentational components render; hooks and `lib/` hold logic and fetch.
- Loading, error, empty, and partial data states are part of the feature, not optional polish.
- Accessibility: semantic HTML, labels, keyboard, focus, contrast. Prefer WCAG 2.2 AA. Do not claim formal certification.
- Do not install `d3`, `react-chessboard`, `chess.js` (frontend), Stockfish WASM, or Nivo unless the user explicitly asks. Heat maths stay in-house (`lib/heat-board.ts`).
- Staunty piece SVGs are third-party (CC BY-NC-SA). Do not modify paths. Keep the footer credit.

---

## Backend rules

- Validate every input at the boundary (path, query, body). Reject with a clear 4xx. Do not echo raw invalid input.
- Stockfish runs only in Celery workers.
- Parameterized queries only. No string-concatenated SQL.
- Pydantic response models. Do not leak PGN, stack traces, or secrets in API responses or logs.
- Rate limits and CORS exist for a reason — preserve them when adding routes (see `SECURITY.md`).
- Username rules: 3–25 chars, letters, digits, `_`, `-` — shared idea on frontend and backend.
- Chess.com fetches: HTTPS, host `api.chess.com` only, no redirects followed, no proxy trust. See adapters and `SECURITY.md`.

---

## TypeScript and Python

**TypeScript:** `strict` on. No `any`. No `@ts-ignore` without a short why. Prefer `unknown` + narrow. Exhaustive `switch` with `never`.

**Python:** type hints on public functions. No bare `except:`. No mutable defaults. Use `pathlib`, context managers, structured logging (not `print` for production paths). Ruff for format/lint; mypy where configured.

---

## Commands

### Frontend (from `frontend/`)

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run test
npm run test:a11y
npm run build
```

On Windows PowerShell, do not chain with `&&`. Run commands separately.

### Backend (from `backend/`, with venv active)

```bash
pytest
ruff check .
ruff format --check .
mypy app
pip-audit
```

### Local infra

```bash
docker compose up -d
```

API default: `http://127.0.0.1:8000`. Web default: `http://localhost:3000`.

---

## Definition of done

A change is done only when:

1. Behavior matches the request and the relevant spec IDs.
2. Lint and typecheck pass for the touched package(s).
3. Tests cover the happy path and the edge cases that apply ([`docs/QC.md`](docs/QC.md)).
4. Code quality and craft checks are clean ([`docs/CODE_QUALITY.md`](docs/CODE_QUALITY.md), [`docs/CRAFT_REVIEW.md`](docs/CRAFT_REVIEW.md)).
5. Security-sensitive surfaces were checked ([`docs/SAFETY_REVIEW.md`](docs/SAFETY_REVIEW.md)).
6. No secrets, `.env`, or plan docs were staged for commit.

---

## Communication

Be concise. Say what changed and how to verify it. Do not pad with process narration.

---

## Final reminder

Before every implementation:

1. Read this file.
2. Read the docs that apply.
3. Write simple, maintainable code — do not overengineer.
4. Prefer reuse and the smallest correct change.
5. Leave the codebase easier to teach and safer to run.
