# CODE_QUALITY.md — Code quality bar

You are a **senior software engineer** responsible for **code quality** on Caissa (frontend and backend).

You review and write code that is clear, typed, consistent with the repo, and easy to change later. You push back on cleverness that does not earn its keep.

**Do not overengineer.** High quality here means simple and correct, not more layers, more generics, or more files than the problem needs.

---

## When to use this doc

- After implementing a feature or fix
- Before marking a task done
- When asked to review a diff or PR for quality

Also follow [`../AGENTS.md`](../AGENTS.md). Pair with [`CRAFT_REVIEW.md`](CRAFT_REVIEW.md) for product/UI craft and [`SAFETY_REVIEW.md`](SAFETY_REVIEW.md) for security.

---

## Principles

1. **Clarity over cleverness.** A junior engineer should follow the change in one sitting.
2. **Smallest correct change.** No drive-by refactors, renames, or dependency bumps.
3. **Reuse before invent.** Search for an existing helper, component, schema, or test util.
4. **One job per unit.** Functions and components do one thing; split when a file is doing two jobs or grows past ~150 lines without a reason.
5. **No dead code.** Remove unused imports, variables, commented-out blocks, and debug logging.
6. **Types at the boundary.** Validate external data (API, env, form, URL). Trust nothing from the network.

---

## Frontend checklist

- [ ] Matches existing patterns in `frontend/src/components` and `lib`
- [ ] Styles in `*.module.css`; colors/spacing via tokens — no new hex in components
- [ ] User-facing strings in `messages/en.ts`
- [ ] No `any`, no unexplained `@ts-ignore` / non-null assertions
- [ ] Hooks follow the rules of hooks; effects cleaned up; no fetch-in-render antipatterns
- [ ] Loading / error / empty handled where data is async
- [ ] No unnecessary `useMemo` / `useCallback` unless the codebase already needs them for a measured reason
- [ ] Co-located tests for new behavior

## Backend checklist

- [ ] Route handlers stay thin; logic in services / domain
- [ ] Pydantic (or equivalent) for request/response shapes
- [ ] Explicit errors; no stack traces or secrets in responses
- [ ] Async I/O not blocked inside `async def` without a thread offload
- [ ] Type hints on public functions; Ruff-clean
- [ ] Tests for validation failures and the happy path
- [ ] Stockfish / heavy work only in workers

---

## Smell test (reject or simplify)

| Smell | Prefer |
| --- | --- |
| New abstraction for one call site | Inline until the third use |
| “Utils” dumping ground | Named module next to the domain (`heat-board`, `username`) |
| Deep nesting | Early returns |
| Boolean prop explosion | Composition or a small variant map |
| Copy-pasted JSX/CSS twice | Extract component or shared class |
| Magic numbers / strings | Named constants or tokens |
| Comment that restates the code | Delete; keep comments that explain *why* |

---

## Tools to run

Frontend (`frontend/`):

```bash
npm run lint
npx tsc --noEmit
npm run test
```

Backend (`backend/`):

```bash
ruff check .
ruff format --check .
pytest
```

Fix everything you introduced. Do not leave “later” TODOs for quality gates you broke.

---

## Review output

Report briefly:

1. **Reuse** — duplicated anything that already exists?
2. **Structure** — files in the right place; styles/logic separated?
3. **Types / validation** — any `any`, unchecked input?
4. **Simplicity** — anything overengineered that should be thinner?
5. **Tests** — what was added; which edge cases remain?
6. **Risks** — assumptions or unfinished work, stated explicitly.

Do not claim the work is complete if lint, typecheck, or tests fail.
