# Export System

The export layer is a primary commercial output of SignalKit. It converts Product Document Packs into production-grade documents for founders, engineers, designers, investors, AI coding agents, and agency clients.

---

## Export Types

| ID | Label | Format | Category |
|----|-------|--------|----------|
| `full_pdf_pack` | Full Product Pack PDF | PDF | PDF |
| `founder_summary_pdf` | Founder Summary PDF | PDF | PDF |
| `investor_memo_pdf` | Investor Memo PDF | PDF | PDF |
| `roadmap_pdf` | Roadmap PDF | PDF | PDF |
| `client_agency_export` | Client-Ready Agency Export | PDF | PDF |
| `markdown_zip` | Markdown ZIP | ZIP | Bundle |
| `ai_agent_engineering_bundle` | AI-Agent Engineering Bundle | ZIP | Bundle |
| `json_bundle` | JSON Bundle | ZIP | Bundle |
| `pm_brief` | PM Brief | Markdown | Brief |
| `designer_brd` | Designer BRD | Markdown | Brief |
| `frontend_brd` | Frontend BRD | Markdown | Brief |
| `backend_brd` | Backend BRD | Markdown | Brief |
| `growth_brief` | Growth Brief | Markdown | Brief |
| `sales_brief` | Sales Brief | Markdown | Brief |
| `evidence_appendix` | Evidence Appendix | Markdown | Evidence |
| `source_appendix` | Source Appendix | Markdown | Evidence |

---

## Export Job Lifecycle

```
POST /workspaces/:ws/packs/:packId/exports
         │
         ▼
    ExportJob (status: queued)
         │
         ▼
    Processing (inline or BullMQ)
         │
       ┌─┴────────┐
       │          │
     ready      failed
       │          │
   artifact    errorCode
   written      logged
```

**Statuses:**
- `queued` — job created, awaiting processing
- `processing` — export engine running
- `ready` — artifact written to storage, download available
- `failed` — rendering failed; `errorCode` explains why
- `expired` — artifact purged after retention period (7 days by default)

---

## Inline vs Queue Mode

| Environment | Behavior |
|-------------|----------|
| `REDIS_URL` not set | Inline export: runs synchronously via `setImmediate()` in the same process |
| `REDIS_URL` set | BullMQ worker picks up the job asynchronously |

**Note:** Do not set `REDIS_URL` to a non-running Redis in development — the system auto-falls back to inline mode with a one-time warning. ECONNREFUSED logs are suppressed after the initial fallback.

---

## Markdown ZIP Structure

```
product-pack/
├── manifest.json          ← Export manifest
├── README.md              ← Human-readable index
├── 00_sources/
│   ├── source_appendix.md
│   └── source_refs.json
├── 01_strategy/
│   ├── product_vision.md
│   ├── market_context.md
│   └── market_selection_memo.md
├── 02_user/
│   ├── icp.md
│   ├── jtbd.md
│   ├── problem_map.md
│   └── user_scenarios.md
├── 03_product/
│   ├── feature_checklist.md
│   ├── mvp_scope.md
│   └── post_mvp_scope.md
├── 04_ux_design/
│   ├── ux_flow.md
│   ├── screen_map.json
│   └── design_brd.md
├── 05_engineering/
│   ├── frontend_brd.md
│   ├── backend_brd.md
│   ├── data_model.json
│   └── api_requirements.yaml
├── 06_ai_handoff/
│   ├── ai_agent_instructions.md
│   ├── acceptance_criteria.md
│   ├── coding_constraints.md
│   └── quality_gates.json
├── 07_growth/
│   ├── monetization_plan.md
│   ├── gtm_plan.md
│   └── analytics_metrics_plan.md
├── 08_evidence/
│   ├── evidence_map.md
│   ├── claims.json
│   ├── evidence.json
│   ├── assumptions.json
│   ├── constraints.json
│   ├── unresolved_questions.json
│   └── contradictions.json
├── 09_roadmap/
│   └── roadmap.md
└── 09_governance/
    ├── document_versions_summary.md
    ├── review_status.json
    └── research_updates.md
```

---

## AI-Agent Engineering Bundle Contract

The AI-Agent bundle is optimized for use with Cursor, VS Code agents, and AI coding agents implementing the product.

**Required files:**

| File | Contents |
|------|----------|
| `manifest.json` | Export metadata |
| `README_FOR_AGENT.md` | Rules and instructions for the agent |
| `product_context.md` | Product summary (from vision + market) |
| `implementation_scope.md` | MVP scope — what to build |
| `feature_checklist.md` | Verified feature list |
| `ux_flow.md` | User journey |
| `screen_map.json` | Screen inventory |
| `frontend_brd.md` | Frontend requirements |
| `backend_brd.md` | Backend requirements |
| `data_model.json` | Entity model |
| `api_requirements.yaml` | API contracts |
| `integration_requirements.md` | Integration details |
| `acceptance_criteria.md` | Given/When/Then acceptance tests |
| `coding_constraints.md` | Technical constraints |
| `evidence.json` | Evidence items |
| `claims.json` | Evidence-backed claims |
| `assumptions.json` | Unvalidated assumptions |
| `constraints.json` | Technical constraints |
| `unresolved_questions.json` | Open questions (must NOT be resolved by agent) |
| `quality_gates.json` | Quality gate results |
| `source_refs.json` | Source references |

**Agent rules (from README_FOR_AGENT.md):**
1. Do not invent missing requirements
2. Unresolved questions must remain unresolved
3. Assumptions are NOT facts
4. Do not build outside MVP scope unless explicitly requested
5. Preserve product law (no app generator, no gradients, no chat-first UX)

---

## Export Manifest

Every export contains a `manifest.json` with:

```json
{
  "schemaVersion": "1.0.0",
  "exportId": "uuid",
  "workspaceId": "ws-id",
  "projectId": "proj-id",
  "packId": "pack-id",
  "packVersion": 1,
  "exportType": "markdown_zip",
  "outputLanguage": "en",
  "createdBy": "user-id",
  "generatedAt": "2026-06-28T00:00:00.000Z",
  "documentList": [...],
  "includedDocuments": [...],
  "excludedDocuments": [...],
  "qualityGateSummary": { "status": "passed", "passedCount": 10, "warnCount": 2, "failCount": 0 },
  "evidenceSummary": { "count": 5, "ids": [...] },
  "assumptionsSummary": { "count": 3, "ids": [...] },
  "constraintsSummary": { "count": 2, "ids": [...] },
  "unresolvedQuestionsSummary": { "count": 1, "ids": [...] },
  "sourceRefs": [...],
  "roleBriefType": null,
  "whiteLabelSettings": null,
  "fileList": [{ "path": "...", "docType": "...", "bytes": 0 }],
  "checksum": "sha256-hex"
}
```

Manifests never contain: encryption keys, password hashes, bearer tokens, or any other secrets.

---

## PDF Export

PDF exports use `pdfkit` (pure Node.js, no browser dependency).

**Supported types:** `full_pdf_pack`, `founder_summary_pdf`, `investor_memo_pdf`, `roadmap_pdf`, `client_agency_export`

**PDF structure:**
1. Title page (pack name, export type, brand, client name, date, disclaimer)
2. Table of contents
3. Document sections (per included document)
4. Evidence & Assumptions Appendix
5. Source Appendix
6. Footer on all pages (brand, date, page numbers)

**Visual style:** Flat 2D, black/white/gray palette. No gradients.

**RTL limitation:** pdfkit has limited bidi support. Arabic text renders in LTR order with correct characters. A full RTL PDF engine or headless browser renderer is needed for production Arabic PDF layout.

---

## Role Brief Document Selection

| Role | Included Documents |
|------|--------------------|
| Founder | product_vision, market_context, market_selection_memo, target_audience_icp, mvp_scope, risks_and_assumptions, roadmap |
| PM | target_audience_icp, jobs_to_be_done, user_scenarios, mvp_scope, feature_checklist, acceptance_criteria, analytics_plan |
| Designer | product_vision, target_audience_icp, user_scenarios, ux_flow, screen_map, design_brd, acceptance_criteria |
| Frontend | ux_flow, screen_map, frontend_brd, api_requirements, acceptance_criteria, data_model |
| Backend | backend_brd, data_model, api_requirements, feature_checklist, acceptance_criteria, risks_and_assumptions |
| Growth | market_context, target_audience_icp, jobs_to_be_done, monetization_plan, go_to_market_plan, analytics_plan |
| Sales | target_audience_icp, problem_map, market_context, monetization_plan, risks_and_assumptions |
| Investor | product_vision, market_context, market_selection_memo, target_audience_icp, mvp_scope, roadmap, monetization_plan, risks_and_assumptions |
| AI Agent | ai_agent_instructions, feature_checklist, mvp_scope, ux_flow, screen_map, frontend_brd, backend_brd, data_model, api_requirements, acceptance_criteria |

---

## White-Label Settings

White-label fields are read from `WorkspaceSettings` at export time and snapshotted into the manifest.

| Field | Purpose |
|-------|---------|
| `brandName` | Replaces "SignalKit" in headers |
| `logoUrl` | Logo on PDF title page |
| `preparedBy` | "Prepared by" field |
| `clientName` | "Prepared for" field |
| `footerText` | Custom PDF footer text |
| `customDisclaimer` | Replaces default disclaimer |
| `hideSignalKitBrand` | Removes SignalKit branding (plan-gated) |

To apply branding, set `applyBranding: true` in the export request.

---

## Storage Paths

### Development

```
{project-root}/.signalkit/exports/{workspaceId}/{exportJobId}/{filename}
```

This path is `.gitignore`d and must not be committed.

### Production (Docker)

```
/var/lib/signalkit/exports/{workspaceId}/{exportJobId}/{filename}
```

Mapped to the `exports_data` Docker named volume via `docker-compose.production.yml`. Configure with:

```
EXPORT_STORAGE_PATH=/var/lib/signalkit/exports
```

### S3/MinIO (future)

The `ExportStorageService` interface is designed for drop-in S3 replacement:

```typescript
write(workspaceId, jobId, fileName, buffer): Promise<storageKey>
read(storageKey): Promise<Buffer>
stream(storageKey): Promise<StreamableFile>
exists(storageKey): Promise<boolean>
```

Swap the provider in `exports.module.ts` — no other changes needed.

---

## Export Expiration and Cleanup

`ExportCleanupService` runs automatically on every API startup and then hourly:

1. **Expire:** marks `ready` jobs whose `expiresAt < now` as `expired`
2. **Delete:** removes artifact directories for jobs that have been `expired` for longer than `EXPORT_RETENTION_DAYS` (default: 7 days)

Full lifecycle:

```
queued → processing → ready → [hourly cleanup] → expired
                    → failed
```

Configuration:

```
EXPORT_RETENTION_DAYS=7   # days after expiresAt before files are deleted
```

Exports are re-generable from the original pack data at any time.

---

## API Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/workspaces/:ws/packs/:packId/exports` | `export:create` | Create export job |
| GET | `/workspaces/:ws/packs/:packId/exports` | `export:read` | List pack exports |
| GET | `/workspaces/:ws/exports/:exportId` | `export:read` | Get export details |
| GET | `/workspaces/:ws/exports/:exportId/status` | `export:read` | Get status |
| GET | `/workspaces/:ws/exports/:exportId/download` | `export:read` | Download artifact |
| GET | `/workspaces/:ws/exports/:exportId/manifest` | `export:read` | Get manifest |

---

## Security

- No API keys, encryption secrets, or password hashes ever appear in export output
- White-label `hideSignalKitBrand` is honoured in PDF and manifest snapshots
- Download requires `export:read` permission (workspace-scoped)
- Artifacts expire after 7 days (configurable via `expiresAt` on `ExportJob`)
- Storage keys are opaque; never expose file system paths to clients

## Session 14 — Build Blueprint files

The **AI-Agent Engineering Bundle** now includes implementation-ready files so an
AI coding agent does not invent product logic:

- `VENTURE_THESIS.md`, `BUILD_BLUEPRINT.md`, `DO_NOT_BUILD.md`
- `SCREEN_CONTRACTS.json` — per-screen logic (states, actions, validation, acceptance)
- `STATE_MATRIX.json` — required UI states per screen
- `API_TO_SCREEN_MAP.yaml` — endpoints each screen reads/writes
- `COMPONENT_CONTRACTS.json`, `PERMISSION_MATRIX.json`, `ANALYTICS_EVENTS.json`
- `VALIDATION_RULES.md`, `EMPTY_LOADING_ERROR_STATES.md`

`README_FOR_AGENT.md` adds rules: implement screens from `SCREEN_CONTRACTS`, do
not invent screen logic, keep unresolved questions unresolved, assumptions are
not facts, do not build anything in `DO_NOT_BUILD.md`, and treat the bundle as
implementation context — not permission to expand product scope.

The **Markdown ZIP** gains a `10_blueprint/` folder containing the same
structured files plus the venture/blueprint markdown documents
(`venture_thesis.md`, `breakout_opportunity_memo.md`, `build_blueprint.md`,
`do_not_build.md`). Structured blueprint data is sourced from the `BuildBlueprint`
entity; venture documents from the pack. See `docs/BUILD_BLUEPRINT.md`.
