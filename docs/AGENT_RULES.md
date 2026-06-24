# Agent Rules

Hard rules for every contributor — human or AI agent — working in this repository. These are enforced by code review, lint/convention and tests. Violations are bugs.

## Product rules (do NOT)

- ❌ Do **not** build an app generator or anything that emits a finished application.
- ❌ Do **not** add a "Generate App" CTA or any Lovable/Bolt/v0-style affordance.
- ❌ Do **not** make chat the main UX. The main UX is the workspace pipeline: Project → Market → Sources → Niches → Evidence → Score → Product Pack → Export.
- ❌ Do **not** create claims without evidence and/or explicit assumptions.
- ❌ Do **not** present unsupported claims as facts, or invent sources.
- ❌ Do **not** add hardcoded English-only UI on core paths.
- ❌ Do **not** use gradients, glassmorphism, neon glow, 3D, or "AI dashboard" aesthetics.

## Product rules (always DO)

- ✅ Every core entity supports: workspace ownership, roles/permissions, locale/language, target market/country/region, source references, evidence, assumptions, constraints, confidence, versioning, audit log, LLM provider routing. (See `@signalkit/shared` `common.ts`.)
- ✅ Every AI generation declares interface language, output language, market language, target country/region, evidence requirement, assumptions policy, unsupported-claims policy, document type, pack depth and vertical template.
- ✅ All screens must handle long localized text (Russian/German/Turkish, RTL Arabic).

## Engineering laws

- No intentional temporary architecture; no TODO-only features.
- No duplicated systems for language / geo / LLM / evidence / document pipeline. There is exactly one of each (`@signalkit/i18n`, geo in `@signalkit/shared`, `@signalkit/llm`, `@signalkit/evidence`, the Product Pack pipeline).
- **All AI calls go through the `LLMRouter`** (`@signalkit/llm`). Feature modules must never call a provider SDK directly.
- Mocking is allowed **only** in tests, local demo/seed data, and provider simulation when credentials are absent. Even without external keys, implement the real integration contract, UI, config, error states and tests.
- Secrets are never committed, never logged, never returned to the frontend (masked display only).

## After every session

1. Inspect the repository first; do not rewrite working code unnecessarily.
2. Add or update tests.
3. Run lint / typecheck / tests / build where available.
4. Update [BUILD_LOG.md](BUILD_LOG.md).
5. Update [ARCHITECTURE.md](ARCHITECTURE.md) if architecture changed.
6. Give a final report: done · files changed · how to verify · known limitations · next risks.
