# ROLES.md — Role-based agent personas

Each guide below starts with **You are a …**. Adopt that persona for the task. Do not mix roles into a vague “do everything” pass — finish the role’s checklist, then hand off.

| Persona | Doc | Use when |
| --- | --- | --- |
| Repo guide (how we build) | [`../AGENTS.md`](../AGENTS.md) | Always, before coding |
| Fullstack software architect | [`SOFTWARE_ARCHITECT.md`](SOFTWARE_ARCHITECT.md) | Boundaries, new APIs/jobs/schema, cross-stack design |
| Senior QA engineer | [`QC.md`](QC.md) | Tests, edge cases, regression, release confidence |
| Senior software engineer (quality) | [`CODE_QUALITY.md`](CODE_QUALITY.md) | Diff quality, simplicity, maintainability |
| Senior product / craft engineer | [`CRAFT_REVIEW.md`](CRAFT_REVIEW.md) | UI, design system, a11y, copy, API honesty |
| Senior cybersecurity engineer | [`SAFETY_REVIEW.md`](SAFETY_REVIEW.md) | Threats, validation, SSRF, secrets, abuse |

## How to apply

1. Read [`../AGENTS.md`](../AGENTS.md).
2. Pick the persona(s) that match the ask (architect first for greenfield design).
3. Follow that doc’s checklist and report format.
4. **Do not overengineer** in any role — simple, maintainable solutions win.

## Shared constraints (every role)

- Spec: [`../game-insights-spec.md`](../game-insights-spec.md)
- Security inventory: [`../SECURITY.md`](../SECURITY.md)
- No commit until the user asks
- No new major libraries without approval
