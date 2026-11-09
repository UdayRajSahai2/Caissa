# CRAFT_REVIEW.md — Craft standard review

You are a **senior product engineer** (craft / design-systems focus) reviewing Caissa for **craft**: product fitness, visual consistency, API honesty, accessibility, and polish that makes the app feel intentional.

Craft is not decoration. It is whether the feature feels finished, matches the design system, and respects the player.

**Do not overengineer.** Prefer the existing tokens, components, and copy patterns over a new design system or animation library.

---

## When to use this doc

- Any UI change (pages, cards, heatmap, boards, forms, footer)
- API response shape changes that users see (errors, progress, empty states)
- Accessibility or theming work
- When asked for a craft / design / UX review

Read [`../game-insights-spec.md`](../game-insights-spec.md) Section 14 (design system) and [`../AGENTS.md`](../AGENTS.md). Pair with [`CODE_QUALITY.md`](CODE_QUALITY.md) and [`QC.md`](QC.md).

---

## Product craft

- [ ] The feature traces to a requirement (or the gap was called out)
- [ ] Primary path is obvious (username → games → heatmap / report / puzzles)
- [ ] Selected vs unselected controls are clear without color alone when possible (e.g. “Viewing”, `aria-selected`)
- [ ] Empty and error copy is plain language, not stack traces or jargon dumps
- [ ] Progress (“N of M games scored”) stays truthful
- [ ] No dead-end UI: every error offers a next step when one exists

---

## Visual and design-system craft

- [ ] Colors, type, spacing, radius, and motion use tokens from `frontend/src/styles/tokens.css` / globals — no one-off hex in components
- [ ] Cards and tabs share one language (cream + border; selected = solid primary fill)
- [ ] Heatmap frame, quiet tiles, and legend stay consistent with paper / ink / amber chrome; data uses Cividis (no green/red brand collision)
- [ ] Light and dark both remain readable; do not invent a third palette
- [ ] Motion is purposeful (2–3 cues max for a surface); respect `prefers-reduced-motion`
- [ ] Layout does not stretch board chrome when the side panel grows (file labels stay tight under the files)
- [ ] Touch/click targets meet ~44px where interactive
- [ ] Popovers are positioned to the trigger (`position: absolute` under the control), never covering the sentence they explain

---

## Chess UI craft

- [ ] Boards keep consistent size; pieces remain Staunty with footer attribution
- [ ] Review / puzzle boards keep playable colors (`#ebecd0` / `#779556`); heatmap uses its own tokens
- [ ] Coordinates (a–h, 1–8) stay aligned with files/ranks
- [ ] Selected heatmap square is unmistakable on quiet and hot fills
- [ ] Mate and CP loss read clearly in lists and tooltips

---

## Accessibility craft

- [ ] Semantic roles: tabs use `tablist` / `tab` / `tabpanel`; buttons have accessible names
- [ ] Focus visible; focus order makes sense
- [ ] Text contrast roughly ≥ 4.5:1 for body; ≥ 3:1 for large text and UI chrome
- [ ] Do not rely on color alone for state when a label or icon is cheap
- [ ] Describe a11y as “aligned with” WCAG 2.2 AA — do not claim certification

---

## API and copy craft (backend + frontend)

- [ ] Error messages are stable and safe (no echoed raw input)
- [ ] Response fields match what the UI already understands; do not rename casually
- [ ] Loading and rate-limit (`429`) states are handled in the UI
- [ ] Copy lives in `messages/en.ts` on the frontend

---

## Anti-patterns

| Avoid | Why |
| --- | --- |
| Purple-on-white or “everything green” | Spec uses paper surfaces, ink-blue brand, amber accent, blue heat ramp |
| Card soup and badge clutter | Competes with the board and takeaways |
| Covering body text with a tooltip in document flow | Hides the product sentence |
| Different border recipes per feature card | Breaks the “one family” feel |
| Installing chart/board libraries for a one-off | Spec and AGENTS forbid unless asked |

---

## Review output

1. **Verdict** — ship / ship with nits / needs work.
2. **Craft wins** — what already meets the bar.
3. **Must-fix** — breaks the design system, a11y, or clarity.
4. **Nits** — optional polish.
5. **Spec gaps** — anything that needs a requirement update first.
