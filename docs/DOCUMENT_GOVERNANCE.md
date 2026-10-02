# Document Governance

Session 11 turns Product Document Pack from a read-only generated artifact into a governed working artifact.

## Overview

Every `ProductPackDocument` is now:
- **Editable** — with markdown editor, dirty state tracking, and save.
- **Versioned** — every save creates a `DocumentVersion` snapshot.
- **Reviewable** — moves through a defined status workflow.
- **Researchable** — `ResearchUpdate` records link real-world learnings to documents.
- **Commentable** — `DocumentComment` rows record team discussion.
- **Assumption-tracked** — `Assumption.validationStatus` reflects what is supported, contradicted, or invalidated.
- **Regeneratable** — governed re-generation through `LlmRouterService` only, with a version created first.

## Editing

A document may be edited by any workspace member with `pack:edit` permission.

**Rules:**
- `locked` documents cannot be edited. Unlock (transition to `approved`) before editing.
- Every save records the new body and creates a `DocumentVersion` (including `authorId`, `changeSummary`, `generatedBy: human`).
- Quality gates are re-run after every save. Gate failure does not block the save.
- The frontend tracks dirty state (unsaved body !== saved body) and shows "Unsaved changes".

**API:** `PUT /workspaces/:ws/packs/:packId/documents/:documentId`

## Versioning

Every meaningful save (manual edit, restore, regeneration) creates a `DocumentVersion` with:
- `version` (incrementing integer on the document)
- `body` (new content)
- `changeSummary`
- `authorId`
- `generatedBy` (`human` for edits, `llm` for regenerations)
- `packId`, `workspaceId` (for routing context)
- `affectedClaimIds`, `affectedAssumptionIds` (from document metadata at time of edit)

**Restore:** restoring a version creates a new version with `changeSummary: "Restored from version N"`. The old history is never deleted.

**API:**
- `GET /workspaces/:ws/packs/:packId/documents/:documentId/versions`
- `GET /workspaces/:ws/packs/:packId/documents/:documentId/versions/:versionId`
- `POST /workspaces/:ws/packs/:packId/documents/:documentId/restore-version`

## Review Workflow

Document `status` (a `DocumentStatus` enum field) drives the review lifecycle.

### States

| Status | Meaning |
|--------|---------|
| `draft` | Newly generated or under active edit |
| `in_review` | Submitted for review |
| `changes_requested` | Reviewer requested changes |
| `approved` | Approved by a reviewer |
| `locked` | Frozen — cannot be edited without unlocking |
| `archived` | No longer active |

### Transitions

| From | To | Action | Required permission |
|------|----|--------|---------------------|
| `draft`, `changes_requested` | `in_review` | `request-review` | `pack:edit` |
| `in_review` | `approved` | `approve` | `pack:approve` |
| `in_review` | `changes_requested` | `request-changes` | `pack:approve` |
| `approved` | `locked` | `lock` | `pack:approve` |
| any | `archived` | `archive` | `pack:approve` |

**API:** `POST /workspaces/:ws/packs/:packId/documents/:documentId/{request-review|approve|request-changes|lock|archive}`

Status badges appear in the document navigation (colored dot) and in the Info panel.

## Research Updates

A `ResearchUpdate` represents a real-world learning that may affect one or more pack documents.

### Types

- `customer_interview` — findings from talking to users
- `competitor_note` — competitive intelligence
- `landing_result` — landing page / fake-door test result
- `survey_result` — survey findings
- `pricing_feedback` — pricing validation data
- `legal_note` — legal / regulatory information
- `local_market_note` — region-specific market context
- `investor_feedback` — investor reactions
- `internal_team_note` — team decision or discussion
- `ai_agent_implementation_feedback` — feedback from an AI coding agent implementing the product

### Linking

Each `ResearchUpdate` can be linked to:
- `linkedDocumentIds` — documents affected
- `linkedClaimIds` — evidence claims affected
- `linkedAssumptionIds` — assumptions that may need revalidation
- `linkedQuestionIds` — unresolved questions it addresses or raises

`confidenceImpact` (`positive` | `negative` | `neutral`) signals whether this update increases or decreases evidence confidence.

**API:**
- `POST /workspaces/:ws/packs/:packId/research-updates`
- `GET /workspaces/:ws/packs/:packId/research-updates`
- `PUT /workspaces/:ws/packs/:packId/research-updates/:id`

## Assumption Validation

`Assumption.validationStatus` tracks the evidential state of every assumption:

| Status | Meaning |
|--------|---------|
| `untested` | Default — not yet validated |
| `supported` | Evidence supports this assumption |
| `contradicted` | Evidence contradicts it (still possible, needs investigation) |
| `invalidated` | Definitively wrong — related docs may be stale |
| `needs_more_data` | Inconclusive — more research needed |

When an assumption is set to `contradicted` or `invalidated`, the system automatically creates an `UnresolvedQuestion` flagging the affected area for review.

**API:** `PUT /workspaces/:ws/assumptions/:assumptionId/validation`

## Comments

`DocumentComment` records team discussion at the document level.

| Field | Meaning |
|-------|---------|
| `status` | `open` (default) or `resolved` |
| `body` | The comment text |
| `authorId` | User who created it |
| `resolvedAt`, `resolvedBy` | When and who resolved it |

Comments can also target specific claims or assumptions (`claimId`, `assumptionId`).

**API:**
- `POST /workspaces/:ws/packs/:packId/documents/:documentId/comments`
- `GET /workspaces/:ws/packs/:packId/documents/:documentId/comments`
- `POST /workspaces/:ws/comments/:commentId/resolve`
- `POST /workspaces/:ws/comments/:commentId/reopen`

## Regeneration

Governed regeneration creates a `DocumentVersion` before applying new content, so the old body is always recoverable.

**Rules:**
- Uses `LlmRouterService` only — never a direct provider call.
- Falls back to deterministic template generation if no LLM connection exists.
- Locked documents cannot be regenerated.
- Quality gates re-run after regeneration.

### Endpoints

| Action | Endpoint |
|--------|---------|
| Regenerate single document | `POST /packs/:packId/documents/:documentId/regenerate` |
| Regenerate linked docs | `POST /packs/:packId/regenerate-affected` (body: `{ researchUpdateId }`) |
| Regenerate weak sections | `POST /packs/:packId/regenerate-weak-sections` |

## Permissions

| Action | Required permission |
|--------|---------------------|
| Edit document | `pack:edit` |
| Save / restore version | `pack:edit` |
| Request review | `pack:edit` |
| Approve / lock / archive | `pack:approve` |
| Add research update | `pack:edit` |
| Add comment | `comment:create` |
| Resolve comment | `pack:edit` |
| Validate assumption | `pack:edit` |
| Regenerate document | `pack:generate` |

## Web UI

The Product Pack Workspace has a three-pane layout:

| Pane | Content |
|------|---------|
| Left (220px) | Document navigation — numbered list with colored status dots |
| Center (1fr) | Toolbar (Edit / Save / Cancel / History / Regenerate) + Reader or Editor |
| Right (280px) | Tabs: Info \| Research \| Comments |

The **Info tab** shows document metadata, review action buttons, and the assumptions tracker.
The **Research tab** shows all research updates and an Add form.
The **Comments tab** shows open/resolved comments and an add-comment field.

The **Version History panel** appears above the document when "History" is clicked — shows version list with Restore buttons.

**Design constraints:** no gradients, no glassmorphism, no chat-first interface, no "Generate App" CTA. Premium flat 2D only.

## Mobile

The mobile pack screen shows:
- Status summary (total docs, approved, in-review, needs-changes counts)
- Document list with status dots and version number
- Research updates read-only list
- Tapping a document shows its status, version, and quality gate result

Editing and commenting are web-only.
