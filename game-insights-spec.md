# Game Insights — Project Specification (Single Source of Truth)

Status: Living document. Every feature built must trace back to a requirement here.
Version: 1.1 (adds Design System + India accessibility alignment)
Last updated: 2026-10-10

---

## 0. How to use this document

This is the spec for Spec-Driven Development (SDD). The flow is:
1. **Constitution** (Section 1) — never violated, applies to every feature, forever.
2. **Scope** (Section 2) — what's in Batch 1 vs. later, so nothing drifts.
3. **Functional requirements** (Section 4) — written in EARS syntax so an AI agent
   can't misread them. Every requirement has an ID (e.g. `ING-01`). Code and tests
   should be traceable back to these IDs.
4. **Architecture / data / API contracts** (Sections 5–7) — the technical shape
   requirements must be implemented within.
5. **Non-functional requirements** (Section 8) — security, accessibility,
   performance bars that apply across all features. The visual **Design System**
   (Section 14) is binding on every piece of UI work; design requirements are
   in Section 4.8.
6. **Build plan** (Section 9) — the order to implement in.
7. **Definition of Done** (Section 10) — the checklist every feature must pass
   before it's considered complete.

When using Cursor + Spec Kit: Section 1 becomes `/speckit.constitution`. Each
subsection of Section 4 becomes its own `/speckit.specify` feature spec.

---

## 1. Constitution (non-negotiable, applies to the whole project)

- C-01: The system SHALL require a signed-in user (GitHub or Google) before showing or starting
  analysis of any Chess.com player's public games. Any signed-in user may analyze any existing public
  Chess.com username. The landing page and the Learn section stay open to everyone. (Changed 2026-11-07
  by the project owner to require sign-in; changed 2026-11-08 to drop the Chess.com ownership check,
  following the Chessiro model: the games are public on Chess.com already, and sign-in plus per-user
  rate limits are what stop abuse.)
- C-02: The system SHALL be free to use and published as open source.
- C-03: The system SHALL use the confirmed tech stack (Section 6) exclusively;
  changing any stack component requires updating this document first.
- C-04: The system SHALL run Stockfish only inside Celery workers, never inside
  a web request/response cycle.
- C-05: The system SHALL meet WCAG 2.2 Level AA on every user-facing screen.
  (WCAG 2.2 AA is a superset of WCAG 2.1 AA, which is the accessibility
  baseline of India's GIGW 3.0 and IS 17802 — see Section 14.10.)
- C-06: The system SHALL NOT ask for Chess.com credentials. Analysis needs only the public
  username.
- C-07: The system SHALL treat the Blunder Heatmap as the primary/hero screen,
  not a secondary tab.
- C-08: The system SHALL cache analysis results keyed by Chess.com username,
  not by any login/session identity.
- C-10: The system SHALL implement all colors, type, spacing, radius, and
  motion through the design tokens in Section 14; hardcoded visual values
  in components are not allowed.
- C-11: The system SHALL describe its accessibility as "aligned with" WCAG 2.2 AA /
  GIGW 3.0 / IS 17802, and SHALL NOT claim certification or formal
  compliance with any standard unless an audit has actually been completed.
- C-09: Every feature built SHALL trace back to a requirement ID in this document.
  If a requested feature has no ID, write the spec first, then build.

---

## 2. Product vision

A free, open-source chess analytics tool. A user signs in, types a Chess.com username,
and receives: a plain-language weakness report, a visual
blunder heatmap (the hero feature), and puzzles generated from their own
real mistakes — all built with accessibility as a first-class requirement,
not an afterthought.

### 2.1 Honest competitive positioning
Chessiro, Aimchess, and Audit Chess already do versions of this. This project
does not claim to be objectively "better" at engine analysis or coverage.
The claim is narrower and verifiable: **the free, open-source, accessible,
visual-first alternative that never asks for a Chess.com password.**

---

## 3. Scope

### 3.1 In scope — Batch 1 (current focus)
- Sign-in with GitHub or Google, and a saved list of Chess.com usernames (AUTH)
- Chess.com game ingestion (last 100–200 games)
- Server-side Stockfish analysis of every move
- Weakness Report (aggregated plain-language insights)
- Blunder Heatmap (hero feature)
- Puzzle Generator (from the user's own blunders)
- Clock-aware blunder tagging (time pressure vs. calculation error)
- Shareable report permalink
- Accessibility baseline across all screens
- Security baseline (Section 8.2)

### 3.2 Explicitly out of scope for Batch 1 (do not build yet)
- User accounts / login / authentication
- Opening repertoire tracking (Batch 2)
- Study companion / embeddable annotated board (Batch 3)
- Lichess data source (future — adapter interface must allow it, implementation does not)
- Club/tournament pairing tools

### 3.3 Out-of-scope boundary rule
If a request during implementation doesn't map to a requirement ID in Section 4,
it belongs in a future batch. Add it to Section 11 (Backlog) instead of building it now.

---

## 4. Functional requirements (EARS syntax)

Format: `WHEN <trigger> THE system SHALL <behavior>` / `IF <condition> THEN THE
system SHALL <behavior>` / `WHILE <state> THE system SHALL <behavior>` /
`WHERE <feature is present> THE system SHALL <behavior>`.

### 4.1 Game Ingestion (ID prefix: ING)
- ING-01: WHEN a user submits a Chess.com username THE system SHALL validate
  the format (alphanumeric, hyphen, underscore only, 3–25 chars) before any
  external request.
- ING-02: IF the username fails validation THEN THE system SHALL return a
  clear error without calling the Chess.com API.
- ING-03: WHEN a valid username is submitted THE system SHALL check for a
  cached report less than 24 hours old before starting new analysis.
- ING-04: IF a fresh cached report exists THEN THE system SHALL return it
  immediately without enqueuing any job.
- ING-05: IF no fresh cache exists THEN THE system SHALL fetch the player's
  archive list from `GET /pub/player/{username}/games/archives`.
- ING-06: WHEN fetching archives THE system SHALL send an explicit
  identifying `User-Agent` header on every Chess.com API request.
- ING-07: THE system SHALL fetch only the most recent 2–3 monthly archives
  and select up to 200 most recent games.
- ING-08: WHERE a game's `chesscom_game_id` already exists in the database
  THE system SHALL skip re-fetching and re-analyzing that game.
- ING-09: THE system SHALL exclude bullet time-control games from weakness
  analysis by default, configurable via a filter parameter.
- ING-10: IF the Chess.com API returns a rate-limit response THEN THE system
  SHALL back off with exponential retry and SHALL NOT surface a raw API
  error to the user.
- ING-11: WHEN resolving any URL returned by the Chess.com API THE system
  SHALL verify the URL's host is `api.chess.com` before requesting it
  (SSRF protection).

### 4.2 Engine Analysis (ID prefix: ANA)
- ANA-01: WHEN the player opens one stored game THE system SHALL enqueue a
  Celery task on the `analysis` queue to evaluate every move of that game
  with Stockfish. Ingestion stores the games and does not start Stockfish.
- ANA-02: THE system SHALL run Stockfish at a fixed depth (default: depth 14)
  sufficient to reliably detect blunders without excessive compute time.
- ANA-03: WHEN the evaluation for a move drops by 150+ centipawns (or
  crosses from winning to losing) compared to the position before it
  THE system SHALL tag that move as a blunder.
- ANA-04: WHEN tagging a blunder THE system SHALL record the game phase
  (opening/middlegame/endgame), board region, and clock time remaining
  at that move.
- ANA-05: IF the player had under 30 seconds remaining at a blundered move
  THE system SHALL tag it `under_time_pressure = true`.

Implementation notes for the open choices in ANA-03 and ANA-04:
- A blunder is a move by the requested player that loses 150 or more centipawns
  from that player's point of view, or that swings from at least +150 to -150.
  The opponent's mistakes are stored as evals but are not tagged as the player's blunders.
- `board_region` is the destination square (`e4`), which is what the heatmap counts.
- Phase is `opening` through ply 20, `endgame` when both queens are gone or 10 or
  fewer pieces besides the kings remain, otherwise `middlegame`.
- ING-07 fetches the latest 3 monthly archives, then ING-09 drops bullet games
  unless `include_bullet` is set, then keeps the 200 most recent games that remain.
- The web request only enqueues a job (JOB-01). Chess.com and Stockfish run in the worker.
- The landing page shows 10 games at a time. Show my games re-reads only the
  newest Chess.com month when that check is more than a minute old. Games
  already stored are not downloaded again; new games in that month are added.
  When the page is already stored, the API answers "refreshing": the stored page is
  shown at once while that check runs in the background, and the list reloads when the
  check finishes. A failed check leaves the stored games on screen. A later page reads the
  database, and downloads the next closed month only when that page is not
  stored yet. Stockfish runs only for the game the player opens.
- ANA-06: THE system SHALL set an explicit Celery `task_time_limit` per
  analysis task so a hung Stockfish process cannot block a worker
  indefinitely.
- ANA-07: THE system SHALL persist move-level eval data (not just the
  aggregate) so the Heatmap and Puzzle features can query it directly.

### 4.3 Weakness Report (ID prefix: WRP)
- WRP-01: WHEN all games in a batch finish analysis THE system SHALL
  aggregate blunder data into a plain-language summary (e.g. phase most
  prone to blunders, time-pressure ratio, opening performance).
- WRP-02: THE system SHALL express every insight in plain language, not
  raw statistics only (a number alone is not sufficient; it must be
  paired with an explanation of what it means).
- WRP-03: THE system SHALL regenerate the report only when new games are
  ingested, not on every page view.

Implementation notes for WRP and SHR-02:
- The report is built in the browser from the stored blunders the report endpoint
  already returns (phase, loss, clock flag, square, piece, better move). No new endpoint.
- Each insight is a card (Section 14.7): headline, one number, one "Try this" line.
  Insights: blunders per game, weakest phase, clock (under 30 seconds), piece, square,
  and big swings (500+ centipawns or an allowed mate). Below the cards: a table by
  phase and the five costliest blunders with the better move.
- Opening performance (WRP-01) needs each game's opening and result, which the report
  payload does not carry yet. It is deferred until the API exposes them.
- SHR-02: "Download image" saves a PNG drawn on a canvas; "Download text" saves the
  same content as plain text for screen readers and copy-paste. Both are made in the
  browser from the same lines; nothing is uploaded.

### 4.4 Blunder Heatmap (ID prefix: HMP) — hero feature
- HMP-01: THE system SHALL render blunder frequency/severity as a spatial
  visualization (by board region and/or game phase), not only as a list.
- HMP-02: THE system SHALL use a colorblind-safe, perceptually uniform
  color scale (diverging, not pure red/green) for the heatmap.
- HMP-03: THE system SHALL display the numeric eval value alongside color
  for every data point, so color is never the sole carrier of information.
- HMP-04: WHEN a user selects a region/cell on the heatmap THE system
  SHALL allow drilling down to the specific game(s) and move(s) behind it.
- HMP-05: THE system SHALL be keyboard-navigable (tab/arrow-key operable),
  not mouse/touch-only.
- HMP-06: WHERE the heatmap is shown THE system SHALL offer a "3D skyline"
  view in which each square rises in proportion to its value. The view SHALL
  be built from the same focusable square controls as the flat board (CSS 3D
  transforms, no 3D library or canvas), so numbers, accessible names, the
  keyboard model, and drill-down stay identical. IF the user prefers reduced
  motion THEN the view SHALL switch without animation. IF forced colors are
  active THEN the view SHALL render flat (A11-14).

### 4.5 Puzzle Generator (ID prefix: PUZ)
- PUZ-01: THE system SHALL generate puzzles only from positions
  immediately before a tagged blunder in the user's own games.
- PUZ-02: THE system SHALL verify via Stockfish that each candidate puzzle
  has one clearly-best move (a meaningful eval gap to the second-best
  move) before including it in the puzzle set.
- PUZ-03: THE system SHALL present 10–15 puzzles per report by default.
- PUZ-04: THE puzzle board SHALL be fully operable via keyboard (square
  selection and move confirmation), not drag-and-drop only.
- PUZ-05: WHEN a user submits an incorrect move THE system SHALL show the
  correct move with the engine line, not just "incorrect."

Implementation notes for PUZ:
- The puzzle set holds up to 15 puzzles from the player's blunders that have a saved
  better move. "Weakest first" orders the phase with the most blunders first, takes one
  puzzle per game before repeating a game, then the costliest blunder. A filter narrows
  the set to opening, middlegame, or endgame.
- Puzzles are one move: the engine's best move is the solution. After the attempt the
  board shows the better move and the engine's reply that punished the original move.
  Multi-move lines and the PUZ-02 Stockfish uniqueness check are deferred; they need the
  engine line stored per blunder and a re-score.
- Pieces slide to their square (Section 14.6 durations; none under reduced motion).
  A piece can be dragged as well as clicked; click and the keyboard always work (A11-06).
- Hints come in steps, like Chess.com: "Hint" highlights the piece to move and names it
  ("move your knight on b1"); "Show where it goes" adds the target square; "Show solution" plays it.
  Any hint makes the puzzle count as missed. Where there is room, the prompt, hints, result, and
  Previous/Next sit in a panel beside the board instead of below it.
- PUZ-06: WHERE the user is signed in THE puzzles SHALL come back on a schedule until they are
  learned (spaced repetition, inspired by Chessiro's resurfacing puzzles). Only the first attempt of
  a puzzle on a given day counts. A miss makes it due the next day. A first solve makes it due in
  3 days. A second solve on a later day marks it learned. A miss at any point starts it over.
  The set shows due puzzles first, then new ones; learned puzzles move to the end and are counted
  ("4 learned"). Days are the user's local days.

### 4.5a Lessons from your blunders (ID prefix: LSN)
- LSN-01: WHERE the player has blunders THE system SHALL offer lessons grouped by their
  weaknesses (weakest phase, clock, most-blundered piece), each built from the player's
  own blunders, not generic content.
- LSN-02: Each lesson example SHALL replay step by step: the position, the move played,
  the engine's reply that punishes it, and the better move, with a plain-language caption
  for every step announced through `aria-live="polite"`.
- LSN-03: The replay SHALL start paused (Section 14.6: no auto-play) and offer Play/Pause,
  previous step, and next step controls that work by keyboard.
- LSN-04: Lessons SHALL NOT embed third-party video; no viewer data leaves the app.

### 4.5b Board sound (ID prefix: SND)
- SND-01: WHEN a move is shown on a board after a user action THE system SHALL play a short
  sound for a move, a capture, a check, a correct puzzle answer, or a wrong one. Sounds are
  original and synthesized in the browser; no third-party sound files are used.
- SND-02: THE system SHALL provide a labeled sound on/off toggle that persists in local
  storage. Sound is never the only feedback; every result also has text (A11-03).

### 4.5c Learn: general chess lessons (ID prefix: LRN)
- LRN-01: THE system SHALL offer a Learn section at `/learn` with general chess lessons
  grouped by topic (openings, tactics, checkmates, strategy, endgames), separate from the
  personal lessons built from the player's blunders (LSN).
- LRN-02: Each lesson SHALL explain one idea in plain language (Section 14.9) and show it
  on step-through boards: a caption for every step, announced with `aria-live="polite"`,
  operable by keyboard, starting paused (Section 14.6).
- LRN-03: Every move in a lesson SHALL be legal and its notation correct; this is checked
  automatically against python-chess before release. Claims about who wins SHALL be
  checked with Stockfish.
- LRN-04: Lessons are original text written for Caissa. No copied text, no embedded video,
  no third-party tracking.
- LRN-05: WHERE a player has been analyzed, the Learn page SHALL link to that player's
  personal lessons and puzzles.

### 4.5d Navigation (ID prefix: NAV)
- NAV-01: THE system SHALL show a primary navigation in the header: Analyze, My games,
  Puzzles, Learn. The current page is marked with `aria-current="page"` and a non-color cue.
- NAV-02: My games and Puzzles SHALL appear only when a player is known (from the URL, or
  the last player analyzed on this device); they are never dead links.
- NAV-03: Outside the landing page, the header SHALL carry a compact, labeled username search
  so another player can be analyzed from any page.
- NAV-04: A player's analysis SHALL live at `/player/<username>` (SHR-01 permalink), with the
  game list at `/player/<username>/games`. The open feature is kept in `?view=` so a refresh
  or a shared link opens the same view. `/player/` avoids clashes with fixed pages such as
  `/learn` that a bare `/<username>` would have.

### 4.5e Sign-in and saved players (ID prefix: AUTH)
- AUTH-01: THE system SHALL let a user sign in with GitHub or Google (Auth.js), keep the session in an
  encrypted http-only cookie (14 days), and store only the provider account id (`github:<id>`), not the
  email or picture. Player pages and the account page require a session; Learn and the landing page do not.
- AUTH-02: WHEN a signed-in user saves a Chess.com username THE system SHALL read the public profile
  once through the Chess.com adapter and save it to that user's list only if the account exists
  (404 otherwise, 502 if Chess.com does not answer). The list is quick links, not a permission: many
  users may save the same username, and a user can remove one at any time.
- AUTH-06: WHEN a signed-in user has no saved Chess.com username THE system SHALL show a one-question
  welcome step ("What is your Chess.com username?") before the player, games, and progress pages, then
  continue where the user was heading. Saving checks the account exists (AUTH-02). Signing in passes
  through this step, which forwards at once when a username is already saved. It is checked on the
  server so nothing flickers; if the API cannot be reached the user is let through. Learn and the
  landing page stay open. (Added 2026-11-08, following Chessiro: sign in, then enter your username.)
- AUTH-03: Browsers SHALL NOT call the API directly. The Next.js server forwards allowlisted paths for a
  signed-in user with a server-only shared secret and the user id; the API refuses any call without the
  secret. A POST through the proxy must carry this site's Origin.
- AUTH-04: Rate limits SHALL count per signed-in user, shared across API processes through Redis.
  Games and jobs are not tied to a user: they hold only public Chess.com data, and job ids are random
  UUIDs.
- AUTH-05: WHEN a signed-in user starts work (any POST through the proxy, or a player sync that can
  queue a download) without bot clearance THE system SHALL answer 428, and the browser SHALL solve a
  proof-of-work challenge invisibly (SHA-256, 14 leading zero bits by default, signed for that user,
  5-minute expiry, single use) to earn an http-only clearance cookie bound to that user for one hour.
  No puzzle is shown (WCAG 2.2 SC 3.3.8), no third-party service is called, and nothing is tracked.
- The existence check reads one small Chess.com profile inside the request, bounded by the client
  timeout and rate-limited per user. Game downloads and Stockfish stay in the workers (C-04).

### 4.5f Game review (ID prefix: REV)
Inspired by Chessiro's game review, built from data Caissa already stores (ANA-07): no new
Stockfish run, no AI coach.
- REV-01: WHEN a scored game is opened THE system SHALL show every move on a board with a move
  list, stepped with buttons and with Left, Right, Home, and End while focus is in the review.
  The first view is the position before the player's first blunder, or the start if there is none.
- REV-02: THE system SHALL label each move Best, Good, Inaccuracy, Mistake, or Blunder, as text
  with an icon (never color alone, A11-03). The label comes from the mover's drop in win chance,
  where win chance = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1) and mate counts as 100 or 0:
  Best when the move equals the engine's move; Inaccuracy at a 10+ point drop; Mistake at 20+;
  Blunder at 30+. For the player's own moves Blunder is exactly the ANA-03 tag, so counts match
  the heatmap and the report; a 30+ drop that ANA-03 did not tag is a Mistake.
- REV-03: THE system SHALL show an accuracy percent for both sides: each move scores
  103.1668 * e^(-0.04354 * drop) - 3.1669 (clamped 0 to 100, at least 1 for the harmonic mean), and
  the game score is the average of the mean and the harmonic mean (as Lichess does, so a few big
  blunders are not hidden by many easy moves in a decided position), with a sentence that says
  what it means.
- REV-04: THE system SHALL show an evaluation graph (White's win chance by move) with key moments
  (mistakes and blunders) marked by shape. Selecting a point jumps to that move. The graph is a
  visual extra: the same facts are in the move list and in a "Key moments" list of buttons (A11-10).
- REV-05: WHERE the game has clock times THE system SHALL show a time graph of the seconds each
  move took, and the move list SHALL show the same seconds. A sentence names the longest think.

### 4.5g Progress and game elements (ID prefix: GAM)
Chessiro has no game elements; this is where Caissa differs. Progress is private to the signed-in
user. There are no leaderboards: anyone may look up any player, so rankings would expose people.
- GAM-01: Daily goal and streak. THE system SHALL set a daily goal of 3 correctly solved puzzles
  and count a streak of local days on which the goal was met. One missed day per calendar week
  (Monday to Sunday) is forgiven as a rest day when the day before it was met. Today does not
  break the streak until it is over.
- GAM-02: XP and ranks. THE system SHALL award XP: 10 for a correct puzzle (first correct attempt
  of that puzzle that day), 2 for a missed puzzle (first attempt of that puzzle that day), 25 for
  each lesson finished the first time, 5 for each game reviewed the first time, and 15 for each day
  the goal is met. Ranks: Pawn 0, Knight 150, Bishop 400, Rook 900, Queen 1800, King 3500 XP.
- GAM-03: Badges. THE system SHALL award: First solve, Daily goal (first goal met), On a roll
  (3-day streak), Week of focus (7-day streak), Comeback (a missed puzzle solved later),
  Clean game (reviewed a game with no blunder by the player), Student (5 lessons),
  Scholar (10 lessons), and Pattern fixed (5 learned puzzles in one phase). Every badge has a
  plain-text name and how it is earned; badges not earned yet say how to earn them.
- GAM-04: Weakness mastery. WHERE a player has puzzles in a phase THE report and the puzzle
  trainer SHALL show learned puzzles toward that phase's goal (15, one full set, or every puzzle
  when there are fewer) as a labelled progress bar with the numbers in text, and "Pattern fixed"
  when the goal (at least 3) is reached. A goal of hundreds would never feel reachable.
- GAM-05: Feedback. WHEN XP, a rank, or a badge is earned THE system SHALL say so in a polite
  live region and show a static, dismissible notice (no confetti, no looping or auto-playing
  animation, Section 14.6). Sounds follow SND-01 and the sound setting.
- GAM-06: Storage and control. THE system SHALL store only the user key, the kind of activity
  (puzzle, lesson, review), its reference (puzzle "game-ply", lesson slug, or game id), the
  Chess.com username and phase for puzzles, the result, and the time. A "Reset progress" action
  deletes all of it. Activity writes are limited per user (60 a minute).
- Implementation notes: the API computes progress from the activity rows in a pure function
  (`app/domain/progress.py`); the browser sends its UTC offset in minutes so days are local.
  A `/progress` page (signed in) shows rank, XP, streak, goal, badges, and puzzles learned by phase.
  Lessons have a "Mark lesson done" button at the end.

### 4.5h Faster first look (ID prefix: FST)
- FST-01: WHILE a player's games are still being scored THE dashboard SHALL show results from the
  games already scored, newest games first, with a real progress bar (scored X of N) and a line
  that the picture sharpens as more games finish. Checks run after 1 s and 2 s, then every 4 s.
  The stored report loads at the same time as the sync check (it needs no sync or bot check), so
  saved results appear without waiting for it; a spinner with text shows until then.
- FST-02: WHEN the user returns to a player already opened in this browser tab session THE
  dashboard SHALL show the last report at once, marked as updating, and replace it when the fresh
  one arrives.

### 4.5i Installable app (ID prefix: PWA)
- PWA-01: THE site SHALL ship a web app manifest (name, icons, theme colors) so it can be added to
  a phone's home screen.
- PWA-02: In production THE site SHALL register a same-origin service worker that serves pages
  and the player's last loaded API answers from cache when offline, network first otherwise. It
  SHALL NOT cache sign-in, bot-check, or POST requests, and SHALL clear its API cache on sign-out.

### 4.6 Shareable Report (ID prefix: SHR)
- SHR-01: WHEN an analysis completes THE system SHALL generate a stable
  permalink for that report. Since AUTH-01, the permalink opens for any signed-in user; sharing
  outside the app uses the downloadable image or text (SHR-02).
- SHR-02: THE system SHALL support generating a downloadable image
  summary of the report for sharing outside the app.

### 4.7 Job Status (ID prefix: JOB)
- JOB-01: WHEN a job is enqueued THE system SHALL return a `job_id`
  within 500ms without waiting for analysis to complete.
- JOB-02: WHILE a job is running THE system SHALL expose progress via
  `GET /jobs/{job_id}` (percentage or games-completed count).
- JOB-03: THE frontend SHALL poll job status and render partial results
  as individual games complete, rather than blocking on the full batch.
- JOB-04: IF a job fails THEN THE system SHALL surface a specific,
  actionable error message, not a generic failure.

### 4.8 Design & Accessibility (ID prefixes: DSN, A11)

Design (DSN):
- DSN-01: THE system SHALL implement the color, typography, spacing, radius,
  elevation, and motion tokens defined in Section 14 as CSS variables, with
  light and dark themes.
- DSN-02: WHEN the user's OS/browser prefers a color scheme THE system SHALL
  default to it, and SHALL provide a manual light/dark toggle that persists
  the choice in local storage.
- DSN-03: THE system SHALL use at most one accent color for primary actions
  and key highlights; all other UI SHALL use the neutral scale.
- DSN-04: THE system SHALL present the Blunder Heatmap as the dominant
  focal element of the results dashboard, above or beside (never below) the
  Weakness Report summary.
- DSN-05: THE system SHALL show designed loading, empty, partial-result, and
  error states for every data-driven view (no blank screens, no bare spinners).
- DSN-06: THE system SHALL use real, product-specific copy in every state;
  placeholder text such as "Lorem ipsum" or "Card title" SHALL NOT ship.
- DSN-07: THE system SHALL be fully usable at 320px viewport width through
  1920px without horizontal page scrolling (wide tables/boards scroll inside
  their own container).
- DSN-08: WHEN the user has `prefers-reduced-motion: reduce` THE system SHALL
  disable non-essential animation and transitions.
- DSN-09: THE system SHALL explain every chess/engine term shown to users
  (e.g. "centipawn", "blunder", "eval") in plain language via inline text or
  an accessible tooltip/popover.

Accessibility (A11):
- A11-01: THE system SHALL meet WCAG 2.2 Level AA success criteria on every page.
- A11-02: THE system SHALL meet these minimum contrast ratios for every
  pairing: 4.5:1 normal text, 3:1 large text (>=24px or >=19px bold), 3:1
  for UI component boundaries, focus indicators, and meaningful graphics
  (verified values for the official palette are in Section 14.2).
- A11-03: THE system SHALL NOT convey information by color alone; every
  color-coded state SHALL also have a text label, number, icon, or pattern.
- A11-04: THE system SHALL provide a visible focus indicator (>=2px, >=3:1
  contrast against adjacent colors) on every interactive element, and the
  focused element SHALL NOT be obscured by sticky headers or overlays
  (WCAG 2.2 SC 2.4.11).
- A11-05: THE system SHALL make every function operable by keyboard alone,
  with a logical tab order and no keyboard traps; a "Skip to main content"
  link SHALL be the first focusable element.
- A11-06: WHERE a function can be done by dragging (moving a chess piece)
  THE system SHALL provide a non-drag alternative (click/keyboard
  select-then-move, and a text move input) (WCAG 2.2 SC 2.5.7).
- A11-07: THE system SHALL make every interactive target at least 44x44 CSS
  pixels (exceeding the WCAG 2.2 AA minimum of 24x24).
- A11-08: THE chessboard SHALL expose a keyboard model: arrow keys move
  square focus, Enter/Space selects a piece then confirms the destination,
  Escape cancels; the board SHALL announce selection, legal destinations, and
  move results to screen readers via an `aria-live` region.
- A11-09: THE Blunder Heatmap SHALL provide an equivalent data-table view
  ("View as table") containing the same information, and each heatmap cell
  SHALL have an accessible name such as "e4: 7 blunders, average loss 240
  centipawns".
- A11-10: THE system SHALL NOT make any information available only through
  hover; hover content SHALL also be reachable by keyboard focus and
  touch, dismissible, and persistent until dismissed (WCAG 1.4.13).
- A11-11: THE system SHALL support 200% browser zoom and 400% reflow at 320px
  width without loss of content or function.
- A11-12: THE system SHALL set `lang` on the document, give every page a
  unique descriptive `<title>`, use one `<h1>` per page with no skipped
  heading levels, and use landmark regions (`header`, `nav`, `main`, `footer`).
- A11-13: THE system SHALL announce asynchronous job progress and completion
  to screen readers via `aria-live="polite"` (not by visual change alone).
- A11-14: THE system SHALL work in Windows forced-colors / high-contrast mode
  without losing boundaries, focus indicators, or heatmap meaning.
- A11-15: THE system SHALL publish an Accessibility Statement page stating
  the target conformance (WCAG 2.2 AA, aligned with GIGW 3.0 / IS 17802),
  known limitations, last-reviewed date, and a contact route for reporting
  barriers.
- A11-16: THE system SHALL run automated accessibility checks (axe-core +
  Lighthouse) in CI and SHALL fail the build on any new serious/critical
  violation.

---

## 5. System architecture

```
Next.js (TS) frontend
        │ REST/JSON
        ▼
FastAPI web tier (routes → services → repositories)
        │
   ┌────┼─────────────┐
   ▼    ▼              ▼
Postgres  Redis    Celery (broker: Redis)
   │               │
   │        ┌──────┴───────┐
   │        ▼               ▼
   │   ingestion queue   analysis queue
   │   (I/O-bound)       (CPU-bound, Stockfish subprocess per task)
   │        │               │
   └────────┴───────────────┘
            │
            ▼
   Chess.com public API
```

Principles:
- Web tier never performs slow work — only enqueues jobs and reads from Postgres.
- Analysis workers scale independently of the web tier.
- Stateless web/worker processes — any instance can be killed/restarted freely.

---

## 6. Confirmed tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js + TypeScript | SSR, portfolio-recognizable, built-in API routes |
| Backend | FastAPI (Python), async-first | Best-in-class chess library support via python-chess |
| Chess logic | python-chess | Strongest PGN/UCI integration of any ecosystem |
| Engine | Stockfish (native binary, server-side via UCI) | Free (GPLv3), strongest engine, no licensing cost |
| Job queue | Celery + Redis | Mature, supports chains/chords/queue routing needed for the analysis pipeline |
| Database | PostgreSQL (SQLAlchemy/SQLModel, Alembic migrations) | Relational data fits naturally; mature managed hosting everywhere |
| Cache | Redis (shared instance, separate key namespace) | One piece of infra, two jobs |
| Hosting | Vercel (frontend) + Railway/Render (API + worker) + managed Postgres/Redis | Free tier to start, scales via instance count later |

Changing any row requires updating this document first (per C-03).

---

## 7. Data model (PostgreSQL)

```
players        id, chesscom_username (unique), last_synced_at
games          id, player_id FK, chesscom_game_id (unique), pgn,
               time_control, time_class, result, played_at, raw_json
moves          id, game_id FK, ply_number, move_san, fen_before,
               eval_cp, eval_mate, clock_remaining_seconds,
               is_blunder, blunder_severity_cp, board_region
blunders       id, move_id FK, game_id FK, player_id FK,
               phase, under_time_pressure (bool)
puzzles        id, player_id FK, source_move_id FK, fen,
               best_move_uci, difficulty_estimate,
               verified_single_best_move (bool)
jobs           id, player_id FK, status, progress_pct,
               error_message, created_at, completed_at
reports        id, player_id FK, weakness_summary_json,
               heatmap_data_json, generated_at
```

Indexes required: `games.chesscom_game_id` (unique), `moves.game_id`,
`moves (game_id, ply_number)` (the report joins each blunder to the next move),
`blunders.player_id`, `jobs.status`.

---

## 8. Non-functional requirements

### 8.1 Accessibility (maps to C-05; detailed requirements in Section 4.8, tokens in Section 14)
- All text/background and UI-component color pairs: WCAG 2.2 AA contrast
  (4.5:1 normal text, 3:1 large text/UI components).
- No information conveyed by color alone — pair with icon or label.
- Visible focus states on all interactive elements.
- Minimum 44x44px touch targets.
- All images have meaningful `alt` text.
- Form inputs have real `<label>` elements.
- Logical heading hierarchy, no skipped levels.
- Light and dark mode supported.

### 8.2 Security baseline
- Pydantic schema validation on every API endpoint — no raw dict bodies.
- Per-IP and global rate limiting on `/analyze/{username}`.
- SSRF guard on all Chess.com-derived URLs (see ING-11).
- All config/secrets via environment variables, never committed.
- `pip-audit` and `npm audit` run in CI.
- HTTPS enforced in all environments.
- CORS locked to the actual frontend origin.
- No secrets or full PGNs with identifying data in logs.

### 8.3 Performance
- Job enqueue response: < 500ms (JOB-01).
- Cached report response: < 300ms.
- Frontend polling: job checks after 0.25s, 0.5s, and 1s, then every 2s, with partial
  results streamed in (JOB-03). Most jobs finish within the quick checks.
- JSON responses over 1 KB are gzip-compressed. The library report reads only the
  columns it needs and names each move from one board read, cached per blunder.

### 8.4 Reliability
- Celery analysis tasks are idempotent (safe to retry) — check for
  existing `game_id` before re-analyzing.
- `acks_late=True` + `prefork` pool on the analysis queue so an in-flight
  task is requeued, not lost, if a worker dies.

---

## 9. Build plan (Batch 1 order)

1. Project scaffolding — Next.js, FastAPI, Celery worker, Docker Compose
   (local Postgres + Redis), layered folder structure.
1b. Design system foundation (DSN-01, DSN-02, DSN-08) — implement Section 14
   tokens as CSS variables (light + dark), fonts via `next/font`, base
   components (Button, Input, Card, Tabs, Tooltip), skip link, focus styles,
   and wire axe-core into CI (A11-16) BEFORE building feature screens.
2. Ingestion plumbing (ING-01 to ING-11) — no UI yet, console output only.
3. Filtering + normalization (ING-09) — sanity-check against real games.
4. Engine integration (ANA-01 to ANA-07) — tune blunder threshold against
   a known game.
5. Storage layer (Section 7 schema) + dedupe logic (ING-08).
6. Celery wiring — queue routing, time limits, acks_late (ANA-06).
7. Weakness Report view (WRP-01 to WRP-03) — first full end-to-end demo.
8. Blunder Heatmap view (HMP-01 to HMP-05).
9. Puzzle Generator view (PUZ-01 to PUZ-05).
10. Shareable report (SHR-01, SHR-02).
11. Polish — loading states, error handling, accessibility pass (8.1),
    security pass (8.2).

---

## 10. Definition of Done (every feature must pass this before merge)

- [ ] Implementation traces to one or more requirement IDs in Section 4.
- [ ] No business logic in route handlers (layered architecture respected).
- [ ] No long-running work inside a request/response cycle.
- [ ] New DB fields have an Alembic migration and needed indexes.
- [ ] External API calls go through the adapter layer, not called directly.
- [ ] Contrast ratios verified for any new UI (8.1, Section 14.2) — new colors
      must be added to the token table with a computed ratio first.
- [ ] Keyboard-operable if interactive, with visible, unobscured focus (A11-04, A11-05).
- [ ] Uses design tokens only — no hardcoded colors/spacing/fonts (C-10).
- [ ] Loading, empty, partial, and error states designed (DSN-05).
- [ ] Information never conveyed by color alone (A11-03).
- [ ] axe-core passes with zero serious/critical violations (A11-16).
- [ ] Manually checked: keyboard-only run-through, 200% zoom, and at least
      one screen reader (NVDA on Windows or VoiceOver) for new interactive features.
- [ ] Input validated via Pydantic schema (8.2).
- [ ] At least one test covering the core logic.
- [ ] No secrets or hardcoded config introduced.

---

## 11. Backlog (ideas captured, not in current scope)

- Batch 2: Opening repertoire leak detection (requires login).
- Batch 3: Study companion / embeddable annotated board for coaches.
- Lichess adapter implementation (interface already allows it).
- Benchmarking against players of similar rating.
- Public API.
- Hindi / multilingual UI (architecture must be i18n-ready from Batch 1:
  externalized strings, `lang` attribute, layouts tolerant of ~30% text expansion).
- Formal third-party accessibility audit (only then may C-11's restriction be revisited).

---

## 12. Open questions / assumptions (resolve before building the affected feature)

- Exact Stockfish depth vs. compute-cost tradeoff may need tuning once
  real load is observed — ANA-02 depth of 14 is a starting assumption.
- Report cache TTL of 24h (ING-03) is an assumption — revisit once usage
  patterns are known.
- Chess piece set not yet chosen — must be an open-licensed set (e.g. from
  Lichess's open-source piece sets) and each piece MUST be verified at >=3:1
  contrast against both board square colors in Section 14.3.
- Font choices (Section 14.4) should be reviewed visually once real screens
  exist; swap only via the token layer, not in components.
- Downloadable report image format (PNG vs. SVG) not yet decided — default
  to PNG unless a reason to change surfaces during SHR-02 implementation.

---

## 13. Glossary

- **EARS**: Easy Approach to Requirements Syntax — the `WHEN/IF/WHILE/WHERE
  ... THE system SHALL ...` phrasing used throughout Section 4.
- **Blunder**: A move causing an evaluation drop of 150+ centipawns or a
  winning-to-losing swing (ANA-03).
- **WCAG**: Web Content Accessibility Guidelines (W3C). This project targets 2.2 Level AA.
- **GIGW 3.0**: Guidelines for Indian Government Websites and Apps, v3.0 (NIC/MeitY, 2023).
  Mandatory for Indian government sites; uses WCAG 2.1 AA as its accessibility
  baseline. This project is NOT a government site and does not seek GIGW certification.
- **IS 17802**: Bureau of Indian Standards accessibility standard for ICT products
  and services, harmonized with EN 301 549 (web requirements are WCAG-based).
- **RPwD Act 2016**: India's Rights of Persons with Disabilities Act, the legal
  backdrop for accessibility in India.
- **Design token**: a named value (color, spacing, font size) defined once and
  referenced everywhere, so visual changes happen in one place.
- **Hero feature**: The Blunder Heatmap — the feature the product is
  positioned around (C-07).

---

## 14. Design System

Binding on all UI work (C-10). Requirements that reference this section: DSN-01..09, A11-02.
All contrast ratios below were computed with the WCAG relative-luminance formula, not estimated.
Any new color MUST be added here with its computed ratio before use.

### 14.1 Aesthetic direction: "The analyst's study"

A calm, focused, editorial look — like a well-made chess book, not a SaaS template.

- **Mood**: warm paper in light mode; in dark mode a midnight ink page with ivory text and gold for
  primary actions (the "midnight, ivory, and gold" direction), lots of whitespace. The page background is never white or black. Each color has one job: ink blue = brand, amber = accent, blue ramp = heatmap data, green = success only, red = danger only.
- **One focal point per screen**: on the dashboard it is the Blunder Heatmap (DSN-04). On the landing page, before any games are analyzed, the focal point is the golden knight photo (`frontend/public/hero-knight.jpg`): an ivory knight on dark marble in gold light, matching the midnight, ivory, and gold direction. It fills the right side and fades into the page, so no text ever sits on it. It has alt text. The brand mark is the gold knight with the serif wordmark "Caissa" (`frontend/public/logo-mark.png`, painted with `--header-current`), and the favicon is the same knight on midnight.
- **Restraint**: primary (ink blue) for header, buttons, selected cards, and links; amber for rings, serif headings, and hot highlights; green/red never used as brand or heatmap fills (DSN-03).
- **Tokens**: every color, space, radius, and type size lives in `frontend/src/styles/tokens.css`. Components only reference `var(--token)`. A design change is an edit in that file. Colors are not stored in `.env`. `.env` holds machine config (database, API URL, Stockfish path).
- **Data first**: charts and boards get clean axes, direct labels, and numbers — not decoration.
- **Real content**: every state has written, specific copy (DSN-06).
- **Avoid**: purple/indigo gradients, neon glows, heavy glassmorphism, stock-illustration
  hero sections, default unstyled component-library themes, emoji as UI icons, “everything green.”

### 14.2 Color tokens (verified WCAG contrast)

Light theme:

| Token | Hex | Used for | Verified contrast |
|---|---|---|---|
| `--bg` | #f3eee3 | page background (warm paper) | — |
| `--surface` | #faf7f0 | cards, panels | — |
| `--surface-2` | #efe8dc | subtle fills, table stripes | — |
| `--text` | #1c1a17 | body text | check ≥4.5:1 on bg/surface |
| `--text-2` | #5c574e | secondary text | check ≥4.5:1 |
| `--primary` | #1f3a5f | header, primary buttons, selected cards, links | white text on primary |
| `--primary-hover` | #162a46 | hover/pressed | — |
| `--on-primary` | #ffffff | text on primary | ≥4.5:1 on primary |
| `--accent` | #b9770e | amber rings, serif headings, highlights | ≥4.5:1 on paper |
| `--success` | #18643f | success only (“Analysis complete”, wins) | 5.9 on surface-2, 6.7 on surface |
| `--warning` | #9a4a0b | mistakes / time pressure | 5.1 on surface-2, 5.8 on surface (was #c45c12, only 4.0:1 as text) |
| `--error` | #b3261e | blunder badges, errors | ≥4.5:1 |
| `--info` | #1f3a5f | info boxes | ≥4.5:1 |
| `--info-tint` | #e8eef7 | info box fill | — |
| `--border` | #7a7468 | input/component borders (needs 3:1) | ≥3:1 |
| `--focus` | #0b57d0 | focus ring | ≥3:1 |

Dark theme: midnight, ivory, and gold. The page is midnight ink, each surface steps lighter so
cards lift off it, text is ivory, and gold marks primary actions, links, and selected controls.
Blue stays for information and focus. Ratios computed with the WCAG formula (2026-11-07).

| Token | Hex | Used for | Verified contrast |
|---|---|---|---|
| `--bg` | #0e1420 | page | — |
| `--surface` | #161d2b | cards | — |
| `--surface-2` | #1e2738 | subtle fills | — |
| `--text` | #f1ebdd | body (ivory) | 15.5 on bg, 14.2 on surface, 12.6 on surface-2 |
| `--text-2` | #bdb6a6 | secondary | 9.1 on bg, 8.4 on surface, 7.4 on surface-2 |
| `--heading` | #f1ebdd | h1 | as `--text` |
| `--primary` | #f2c14e | buttons, links, selected controls (gold) | 11.0 on bg, 10.1 on surface |
| `--on-primary` | #0b1220 | text on gold | 11.2 on primary |
| `--accent` | #ffc857 | amber accent | — |
| `--success` | #5fcf95 | success only | 8.7 on surface |
| `--warning` | #ffb020 | warning | 9.2 on surface |
| `--error` | #ff8a80 | danger | 7.4 on surface |
| `--info` | #8fb4ee | info | 8.0 on surface, 7.4 on info-tint |
| `--info-tint` | #17233a | info fill | — |
| `--border` | #8a93a3 | borders | 6.0 on bg, 5.5 on surface |
| `--focus` | #8ab4f8 | focus ring | 8.7 on bg, 8.0 on surface |

The focus ring is drawn 2px outside the control, so the colors it touches are the page and the
control's outer edge gap (8.7:1), not the gold fill itself (1.3:1). Keep `outline-offset` at 2px or
more on gold controls.

Header stays ink blue (not the same as page mint/green). Amber rule under the bar.

| Token | Light | Dark |
|---|---|---|
| `--header-bg` | #1f3a5f | #0a0f19 |
| `--on-header` | #ffffff | #f1ebdd |
| `--header-chip` | #faf7f0 | #1a202a |
| `--header-chip-text` | #1c1a17 | #e9e6df |
| `--header-chip-accent` | #b9770e | #ffc857 |
| `--header-chip-border` | #7a7468 | #8a93a3 |
| `--header-current` | #f2c14e (6.8:1 on header) | #ffc857 (12.5:1 on header) |

Rules:
- Semantic colors (success/warning/error/info) are ALWAYS paired with an icon and a text label (A11-03).
- Never put `--text-2` on a colored fill without re-verifying the ratio.
- Implement as CSS variables on `:root`, redefined under `@media (prefers-color-scheme: dark)`
  guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`,
  so the manual toggle (DSN-02) overrides the OS preference.

### 14.3 Heatmap and board colors

Heatmap uses **Cividis** (blue → grey → yellow), sampled via `d3-scale-chromatic`
`interpolateCividis`. No green/red, so success/danger roles stay clear. Quiet tiles are cool
grey (light) or ink navy (dark); frame is `#14213a`. The busiest squares show their number;
there are no extra rings on hot squares, so the only outline on the board is the selection.
Quantile cuts and gaps stay in `heat-board.ts`.

Light stops (toward navy): `0.92, 0.7, 0.45, 0.12` · Dark stops (toward yellow): `0.3, 0.51, 0.72, 0.95`.

- Every heatmap cell MUST show its numeric value (A11-03, HMP-03); color is secondary.
- When new scores arrive while polling, tiles ease to their new color (DSN-08 applies);
  the board does not replay its entrance or redraw when a poll returns the same data.
- Legend is a connected strip with inclusive ranges under each step; optional corner dots mark the step index.
- Phase bars use mid-Cividis tones; amber is accent only, never a heatmap fill.
- The selected square keeps its own heat fill and is marked by a two-tone ring
  (ink `#0b1220` inside, white outside) plus a slight inset. It is the only outline on the board.
  Selection is never a fill color, because any fill collides with some step of the
  ramp (dark-theme Cividis ends in yellow, close to amber).
- Red is reserved for literal blunder badges/icons, not the heat fill.

Board squares (playable review boards): light `#ebecd0` (`--board-light`), dark `#779556` (`--board-dark`).
`--on-board` is `#1c1a17`; headings on paper use amber (`--accent`); brand chrome uses `--primary`.
- Every piece in the chosen set MUST be verified at >=3:1 against BOTH square colors.
- Offer a high-contrast board theme (e.g. near-white vs. near-black squares with
  strongly outlined pieces) as a user setting.
- Highlight colors (last move, selected piece, legal moves) need >=3:1 against the
  squares they overlay AND a non-color cue (outline, dot, or ring).

### 14.4 Typography

| Role | Font | Notes |
|---|---|---|
| Display headings (h1, h2 only) | Fraunces (serif) | gives the editorial/"chess book" character |
| UI + body | Manrope (sans) | clean, highly legible |
| Notation, eval numbers, code | IBM Plex Mono | use tabular figures so columns of numbers align |

- Load via `next/font` (self-hosted, no third-party request at runtime).
- Every font has a real fallback stack (e.g. `Georgia, serif` / `system-ui, sans-serif` / `ui-monospace, monospace`).
- Type scale (ratio ~1.25, base 16px): 13 / 14 / 16 / 20 / 25 / 31 / 39 / 49 px.
- Body text minimum 16px; line-height 1.5–1.6 for body, 1.2–1.3 for headings.
- Line length 60–75 characters for prose.
- Never use font weight below 400 for body text. Support user text-spacing overrides
  (WCAG 1.4.12) — no fixed-height text containers.
- Max 3 font families total; weights limited to 400, 500, 700.

### 14.5 Spacing, shape, elevation, layout

- **Spacing scale (4px base)**: 4, 8, 12, 16, 24, 32, 48, 64, 96. No other values.
- **Radius**: 4 (inputs/chips), 8 (buttons/cards), 16 (large panels), 9999 (pills/avatars).
- **Elevation**: 3 levels only — flat (border only), raised (cards), overlay (popovers/dialogs).
  In dark mode express elevation with lighter surface + border, not heavy shadows.
- **Layout**: content max-width 1200px; 12-column grid on desktop; single column on mobile.
- **Breakpoints**: 480 / 768 / 1024 / 1280 px. Mobile-first CSS.
- **Safe areas and touch**: 44x44px minimum targets (A11-07); 8px minimum gap between adjacent targets.

### 14.6 Motion

- Durations 150–250ms, `ease-out`; used only to clarify state change (tab switch, panel open,
  heatmap fade-in as results stream in).
- No auto-playing, looping, or parallax animation.
- Under `prefers-reduced-motion: reduce`: remove transitions and animations entirely (DSN-08).
- Progress indicators show real progress (games analyzed X of N), not an indefinite spinner.

### 14.7 Component specifications

| Component | Requirements |
|---|---|
| **Username input (hero)** | Large, labeled field (real `<label>`), example placeholder only as a hint, inline validation message tied via `aria-describedby`, primary "Analyze my games" button. Signed-out users are sent to sign in first (AUTH-01). |
| **Job progress panel** | Real progress ("Analyzed 34 of 120 games"), `aria-live="polite"` updates (A11-13), partial results appear as they complete, cancel/retry affordance on failure. |
| **Weakness report cards** | Plain-language headline + one supporting number + one "what to do" line. Max 3 lines of body. Terms explained per DSN-09. |
| **Blunder heatmap** | Hero component. Board-region grid + phase timeline, numeric labels in cells, legend, "View as table" toggle, keyboard navigable, cell selection drills down to games. |
| **Chessboard** | Per A11-06/A11-08: keyboard model, text move input alternative, aria-live announcements, coordinates labeled, orientation toggle, high-contrast theme. |
| **Puzzle player** | Prompt ("White to move — find the best move"), feedback with icon + text ("Correct" / "Not quite"), reveal best line on failure (PUZ-05), progress "Puzzle 3 of 12", skip control. |
| **Tabs / navigation** | Real `role="tablist"` pattern with arrow-key support, or plain links to routes; visible selected state not reliant on color alone (underline + weight). |
| **Buttons** | Primary (filled `--primary`), secondary (outlined), tertiary (text). Visible focus ring, 44px min height, disabled state still meets 3:1 on its boundary where it conveys status. |
| **Tooltips/popovers** | Open on hover AND focus, dismissible with Escape, hoverable, persistent until dismissed (A11-10). Never the only place important info lives. |
| **Toasts/alerts** | Icon + text + semantic color; `role="status"` (or `alert` for errors); never auto-dismiss errors. |
| **Share card (image)** | Fixed-size layout on brand tokens, includes text version of every stat (not just a graphic), generated image carries alt text when embedded in-app. |
| **Theme toggle** | Three states: System / Light / Dark; labeled; persists (DSN-02). |

### 14.8 Page layouts (structure, not pixels)

Landing (`/`):
```
[skip link]
header: logo · nav (Analyze, Learn; My games and Puzzles once a player is known) .... Sign in (opens the
        sign-in dialog) or the avatar menu (initials; Your Chess.com accounts, Sign out) · theme toggle
main (full-bleed hero: text left, the battle plate right, fading into the page):
  h1  "See where your games are really lost."
  p   one-sentence value prop (free, open source, no signup)
  [ Chess.com username input ] [ Analyze my games ]
  small: "No account needed. Your games are public data; we never ask for a password."
  four short feature blurbs: Heatmap / Weakness report / Your own puzzles / Lessons
footer: Open source (repo link) · Accessibility statement · Privacy
```
The hero headline stays plain: no tracked all-caps eyebrow above it and no single word set
in a different color or italic. Hype copy ("the ultimate chess experience") is not used (14.9).

Dashboard (`/player/<username>`, NAV-04; the header adds the compact search, NAV-03):
```
header (sticky; must not obscure focused elements — A11-04)
main:
  h1 "Analysis for <username>"   [job progress panel when running]
  ┌──────────────── HEATMAP (hero, dominant) ─────────────┐ ┌ Weakness summary ┐
  │ board-region heatmap + phase timeline + legend         │ │ 3 top insights    │
  │ [View as table]                                         │ └───────────────────┘
  └───────────────────────────────────────────────────────┘
  tabs/links: Report · Heatmap detail · Puzzles
  puzzle preview strip → "Practice your 12 puzzles"
footer
```
On mobile: single column in this order — progress → heatmap → summary → puzzles.

### 14.9 Content and voice

- Plain language, short sentences, target roughly a Grade 8 reading level.
- Explain engine terms where they appear: "A blunder is a move that drops your winning chances
  sharply (about 1.5 pawns of engine evaluation or more)."
- Insights say what, why it matters, and what to do:
  "You blundered 3x more often with under 30 seconds left. Try playing faster in the opening to
  bank time for the middlegame."
- Errors are specific and actionable: "We couldn't find a Chess.com player named 'xyz'. Check the
  spelling — usernames are not case-sensitive."
- Neutral, encouraging tone. No shaming ("you suck at endgames"), no hype ("revolutionary AI").
- All user-facing strings live in a single messages file (i18n-ready; see Backlog).

### 14.10 Accessibility standards mapping (India and international)

| Standard | What it is | Relationship to this project |
|---|---|---|
| **WCAG 2.2 AA** | International W3C standard | **Primary target (C-05).** Adds over 2.1: focus not obscured (2.4.11), dragging alternatives (2.5.7), 24px minimum target size (2.5.8), consistent help (3.2.6), redundant entry (3.3.7), accessible authentication (3.3.8). |
| **WCAG 2.1 AA** | Previous W3C version | Fully covered, since 2.2 AA includes all 2.1 AA criteria. |
| **GIGW 3.0** (NIC/MeitY, 2023) | Guidelines for Indian Government Websites and Apps; mandatory for government sites; STQC-certified | Its accessibility baseline is WCAG 2.1 AA, so we are **aligned** on accessibility. It also has government-specific rules (national emblem, bilingual content, government domain, STQC certification) that do **not** apply to this project. |
| **IS 17802** (BIS) | Indian standard for ICT accessibility, harmonized with EN 301 549 | Web requirements are WCAG-based, so WCAG 2.2 AA gives us headroom. |
| **RPwD Act 2016** | Indian law on rights of persons with disabilities | Legal context for why accessibility matters; no certification process for private sites. |

Position (per C-11): the project states it is "designed to align with WCAG 2.2 AA, GIGW 3.0's
accessibility baseline, and IS 17802." It does not claim certification or formal compliance
without a completed audit. The Accessibility Statement page (A11-15) says exactly this.

Testing plan:
1. **Automated**: axe-core in unit/e2e tests and CI gate (A11-16); Lighthouse accessibility score tracked.
2. **Keyboard-only run-through** of every flow: input → analysis → heatmap drill-down → puzzle solving.
3. **Screen readers**: NVDA (Windows) and VoiceOver (macOS/iOS) on the heatmap, board, and puzzle player.
4. **Zoom/reflow**: 200% zoom and 400% reflow at 320px width.
5. **Color vision**: simulate protanopia, deuteranopia, tritanopia and grayscale on the heatmap and board.
6. **Forced-colors mode** (Windows High Contrast) check (A11-14).
7. **Reduced motion** check (DSN-08).
8. Log findings in `ACCESSIBILITY.md`; fix serious issues before each release.
