# Product Context

## What we are building

SignalKit / NicheOS is an AI-first B2B/SaaS platform that helps people find **trending, evidence-backed market opportunities** and turn a chosen opportunity into a deep, multilingual, **build-ready Product Document Pack**.

It works as both a web application and a mobile companion app, is multilingual from day one, and uses the user's gelocation only with explicit consent.

## Who it is for

- **Founders** evaluating where to build next.
- **Product managers** turning an opportunity into a concrete plan.
- **Designers, frontend, backend engineers** receiving role-specific build briefs.
- **Growth & sales** teams receiving GTM and positioning material.
- **Investors** receiving evidence-backed opportunity memos.
- **AI coding agents** receiving a machine-readable engineering bundle.
- **Agencies & venture studios** producing client-ready, white-labeled deliverables.

## The main output

The primary deliverable is the **Product Document Pack**: up to 27 structured documents (vision, market context, ICP, JTBD, problem map, scope, UX flow, BRDs, data model, API requirements, AI agent instructions, acceptance criteria, monetization, GTM, analytics, risks, roadmap, market selection memo, evidence map, source appendix). Every document carries language, target market, source references, claims, assumptions, constraints, confidence and quality-gate status.

## What the product explicitly does NOT do

- It does **not** generate finished applications.
- It is **not** a Lovable / Bolt / v0 clone.
- There is **no "Generate App" CTA** anywhere.
- Chat is **not** the main interface — the main UX is a workspace pipeline:
  **Project → Market → Sources → Niches → Evidence → Score → Product Pack → Export.**
- It never presents unsupported claims as facts and never invents sources.

## How opportunities are found

Real **source ingestion** → normalized **signals** → an **evidence graph** (claims, evidence, contradictions, assumptions, confidence) → **scoring** → **niches** → **Product Document Pack**. Nothing important is asserted without evidence or an explicit, tracked assumption.

## Venture-scale opportunities & build readiness (Session 14)

SignalKit does not output weak trend niches. Every strong opportunity carries a
**Venture Thesis** (wedge → expansion → venture path → kill reasons) and four
**separate** scores: Opportunity (good opportunity?), Confidence (well
supported?), Venture Scale (could become large?) and Build Readiness (ready to
build?). There is **no fabricated TAM** and **no unsupported unicorn claims** —
weak market size and unproven moats are flagged as assumptions / unresolved
questions, never presented as facts.

The **Build Blueprint** turns a pack into implementation-ready context: screen
logic, state matrix, API-to-screen mapping, component contracts, permission
matrix, analytics events and an explicit `DO_NOT_BUILD` list. This lets
designers, developers and AI coding agents implement without inventing product
logic. See `docs/BREAKOUT_OPPORTUNITY_ENGINE.md` and `docs/BUILD_BLUEPRINT.md`.
