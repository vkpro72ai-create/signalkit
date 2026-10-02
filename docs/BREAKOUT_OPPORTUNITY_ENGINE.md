# Breakout Opportunity Engine (Session 14)

SignalKit must not output a list of small, obvious "trend niches". The Breakout
Opportunity Engine analyzes each strong opportunity for **venture-scale**
potential and produces a structured, evidence-aware **Venture Thesis** plus a
separate **Venture Scale Score**.

## Why SignalKit does not output weak trend niches

Trend/niche discovery alone can surface narrow app ideas. A narrow idea is not
the same as a large opportunity. The engine forces every strong niche through a
breakout lens — macro shift, pain economics, entry wedge, expansion thesis,
incumbent weakness, AI unlock, distribution wedge, data/workflow moat, venture
path and kill reasons — so the output is a *build-ready opportunity*, not a
guess.

## The four separate scores

These are kept **strictly separate** and never merged:

| Score | Question | Where computed |
|-------|----------|----------------|
| **Opportunity Score** (0–100) | Is this a good opportunity? | `packages/shared/src/scoring.ts` |
| **Confidence Score** (0–1) | How well supported is it? | `packages/shared/src/scoring.ts` |
| **Venture Scale Score** (0–100) | Can it become a large company? | `packages/shared/src/venture.ts` |
| **Build Readiness Score** (0–100) | Is it ready to design/build? | `packages/shared/src/blueprint.ts` (see [BUILD_BLUEPRINT.md](BUILD_BLUEPRINT.md)) |

## Venture Scale dimensions

`computeVentureScaleScore(input)` scores 15 dimensions, each with a score,
reasoning, an **assumption flag**, a per-dimension confidence and (when weak) an
unresolved question:

`market_size_path`, `pain_cost`, `frequency`, `budget_ownership`,
`distribution_wedge`, `data_moat`, `workflow_ownership`, `expansion_surface`,
`incumbent_weakness`, `ai_unlock`, `timing_shift`, `global_repeatability`,
`network_effects`, `revenue_density`, `category_creation`.

### Honesty rules (enforced in code + tests)

- **No fake TAM.** `market_size_path` is **always** assumption-based and carries
  a "no fabricated TAM" question until real evidence is added. Weak market size
  becomes an assumption / unresolved question — never a number we invented.
- **No unsupported unicorn claims.** The explanation always states venture scale
  is *potential, not a guarantee*, and reports how many dimensions rest on
  assumptions. The quality gate `no_fake_tam` fails any venture document that
  asserts a `$N billion/trillion` / unicorn claim on a line not framed as an
  assumption.
- **Assumptions are not facts.** Every un-evidenced dimension is flagged
  `assumptionBased: true` and surfaces in `whatMustBeTrue`.
- **Confidence is separate.** Venture-scale confidence reflects evidence
  coverage, not the score itself.

## The Venture Thesis

`buildVentureThesis(input)` (`apps/api/src/niches/venture.ts`) converts the niche
+ evidence + Venture Scale Score into a structured `VentureThesis`:

breakout thesis · why now · macro shifts · entry wedge · expansion path · target
customer · pain economics · alternatives/incumbents · AI unlock · distribution
wedge · data/workflow moat · monetization path · market/local constraints ·
venture-scale narrative · kill reasons · what must be true · first validation
experiments · evidence confidence · assumptions · unresolved questions.

Each narrative section is an evidence-aware `ThesisSection { text, assumption }`.
Sections backed by a matching claim are marked `evidence`; everything else is
explicitly `assumption`. **Kill reasons** are derived from the weakest
venture-scale dimensions, so the downside is always visible.

## How it is generated & persisted

- `NichesService.score()` recomputes the Venture Thesis whenever a niche is
  scored/rescored (during `discover` and `rescore`).
- `NichesService.computeVenture()` builds the scoring input from the project's
  **real** signals + evidence, links dimensions to backing claims, and persists
  the latest thesis to the `VentureThesis` table (latest wins, idempotent).
- All AI enhancement (if any) flows through `LlmRouterService` only. The base
  thesis is deterministic and never invents sources.

## API

| Method | Path | Permission |
|--------|------|-----------|
| `GET` | `/workspaces/:ws/niches/:id/venture-thesis` | `niche:read` |
| `POST` | `/workspaces/:ws/niches/:id/venture-thesis/regenerate` | `niche:discover` |

## Schema

Additive migration `20260629_breakout_venture_blueprint` adds the `VentureThesis`
table (per niche): structured `thesis` JSON, `ventureScaleScore`,
`ventureScaleConfidence`, `ventureScaleLevel`, `ventureScaleBreakdown` and
`whatMustBeTrue`. No existing table is altered.

## Exports

The Venture Thesis and Breakout Opportunity Memo appear as pack documents
(`venture_thesis`, `breakout_opportunity_memo`) and ship in the Markdown ZIP
(`10_blueprint/`) and AI-Agent bundle (`VENTURE_THESIS.md`). See
[EXPORTS.md](EXPORTS.md).
