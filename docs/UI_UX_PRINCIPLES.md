# UI/UX Principles

## Visual law (non-negotiable)

- **No gradients.** Solid, flat colors only. Theme values are validated against this (`assertNoGradient` in `@signalkit/ui`).
- No glassmorphism, no neon glow, no 3D, no "AI dashboard" purple-blue aesthetic.
- **Premium flat 2D**: strong typography, sharp information hierarchy, an editorial SaaS feel — dense but readable.

## Typography & tokens

A single token system (`@signalkit/ui`) defines the typographic scale, spacing (4pt grid), radius, borders and flat color palettes (light + dark). Semantic colors: `opportunity`, `confidence`, `risk`, `evidence`, `warning`, `success`, `draft`, `ready`, `failed`, `muted`. Web and mobile consume the same tokens — never re-defined per app.

## Information design

- Surface trust everywhere: score, confidence, evidence and risk badges; "Why do we believe this?", "What is weak?", "What contradicts this?" affordances.
- The Product Pack workspace uses a three-pane layout: document navigation · reader/editor · metadata panel (confidence, claims, evidence, assumptions, constraints, unresolved questions, quality gate, versions).

## Multilingual-friendly layout

- Every screen must render long localized labels (Russian, German, Turkish) without breaking.
- RTL-ready for Arabic from the architecture layer (`isRtl()` in `@signalkit/i18n`; `dir` set at the document root).
- No hardcoded English on core paths; model descriptions and document types use translations.

## UX model

Chat is **not** the main interface. The product is a workspace pipeline:

**Project → Market → Sources → Niches → Evidence → Score → Product Pack → Export.**

Mobile is a serious companion app for reviewing, reading, approving and monitoring exports — not a toy and not a raw JSON viewer.

## Accessibility

Sufficient contrast on flat palettes, focus states, semantic headings, and readable minimum font sizes are baseline requirements, not enhancements.
