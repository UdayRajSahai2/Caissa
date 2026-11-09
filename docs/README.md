# Agent review docs

These guides tell AI coding agents how to work on **Caissa** (frontend + backend). They sit next to the root [`AGENTS.md`](../AGENTS.md).

Every specialist doc is **role-based** (“You are a …”). See [`ROLES.md`](ROLES.md) for the full persona map.

## Read order

| Doc | Role | When to read |
| --- | --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | How to build in this repo | Always, before coding |
| [`ROLES.md`](ROLES.md) | Which persona to adopt | When choosing a review or design pass |
| [`SOFTWARE_ARCHITECT.md`](SOFTWARE_ARCHITECT.md) | Fullstack software architect | Cross-stack design, new APIs/jobs/schema, “where does this live?” |
| [`QC.md`](QC.md) | Senior QA engineer | Before finishing a feature or bugfix; when asked to test |
| [`CODE_QUALITY.md`](CODE_QUALITY.md) | Senior software engineer (quality) | After writing code; before claiming done |
| [`CRAFT_REVIEW.md`](CRAFT_REVIEW.md) | Senior product / craft engineer | UI/API changes; design-system work |
| [`SAFETY_REVIEW.md`](SAFETY_REVIEW.md) | Senior cybersecurity engineer | New endpoints, auth-adjacent work, input handling, deps, deploy |

Also keep open when relevant:

- [`../game-insights-spec.md`](../game-insights-spec.md) — requirements and design system
- [`../SECURITY.md`](../SECURITY.md) — controls already in place

## Rule

Agents must not skip these docs because a task “looks small.” A one-line API change can still need QC and a safety pass. Structural work should start with the architect role.
