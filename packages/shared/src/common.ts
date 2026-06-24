/**
 * Cross-cutting primitives shared by every SignalKit entity.
 *
 * The platform's master rule: every key entity must support workspace ownership,
 * locale/language, target market, source references, evidence, assumptions,
 * constraints, confidence, versioning and audit. These building blocks make that
 * uniform instead of re-invented per feature.
 */
import type { LocaleCode } from './geo.js';

/** Branded ID aliases — all entity IDs are opaque strings (cuid/uuid at the DB layer). */
export type Id = string;
export type WorkspaceId = Id;
export type UserId = Id;
export type ProjectId = Id;
export type IsoDateTime = string;

/** Creation/update timestamps present on every persisted entity. */
export interface Timestamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Soft-deletion marker. */
export interface SoftDeletable {
  deletedAt: IsoDateTime | null;
}

/** Every persisted entity is owned by exactly one workspace (tenant boundary). */
export interface WorkspaceOwned {
  workspaceId: WorkspaceId;
}

/** Monotonic versioning for any entity that can change over time. */
export interface Versioned {
  /** Current version number, starts at 1 and increments on significant save. */
  version: number;
}

/**
 * Confidence is a first-class concept across niches, claims, scores and packs.
 * Stored as a 0..1 value plus a coarse band for UI.
 */
export type ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export interface Confidence {
  /** 0.0 – 1.0 */
  value: number;
  level: ConfidenceLevel;
  /** Short, localized rationale describing why confidence is what it is. */
  rationale?: string;
}

/** Generic localized text: a value plus the language it is written in. */
export interface LocalizedText {
  language: LocaleCode;
  text: string;
}

/** Who/what produced a piece of content. Evidence trust depends on this. */
export type GeneratedBy = 'human' | 'llm' | 'system' | 'imported';

/** Pagination envelope for list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Standard API error envelope (mirrors the NestJS exception filter shape). */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Result helper for operations that can fail without throwing. */
export type Result<T, E = ApiError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
