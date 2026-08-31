/**
 * Self-improvement pipeline contracts (Layer 2 / Phase L2.1).
 *
 * Zero runtime dependencies, like the rest of this package, so the same
 * classifier logic runs both inside the API (storing what a CI job reports)
 * and inside the standalone CI script that scans a generated migration
 * before anything is proposed for merge — the two must never drift apart.
 */

/**
 * Conservative, four-tier classification. The default for anything not
 * explicitly recognized is `manual_review_required` — the ABSENCE of a
 * destructive keyword is never treated as proof of safety. Only a narrow,
 * explicitly recognized set of additive shapes earns `safe_additive_candidate`.
 */
export type MigrationSafetyClass =
  | 'none'
  | 'safe_additive_candidate'
  | 'manual_review_required'
  | 'destructive_blocked';

/** Statements that always mean data loss or a breaking change for the previous app version. */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+CONSTRAINT\b/i,
  /\bDROP\s+INDEX\b/i,
  /\bDROP\s+TYPE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bRENAME\s+(TO|COLUMN)\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
];

/** A narrow, explicitly-recognized allowlist of additive, backward-compatible statement shapes. */
const SAFE_ADDITIVE_PATTERNS: RegExp[] = [
  /^CREATE\s+TABLE(\s+IF\s+NOT\s+EXISTS)?\b/i,
  /^CREATE\s+(UNIQUE\s+)?INDEX(\s+CONCURRENTLY)?(\s+IF\s+NOT\s+EXISTS)?\b/i,
  /^CREATE\s+TYPE\b/i,
  /^ALTER\s+TYPE\b[^;]*\bADD\s+VALUE\b/i,
  /^COMMENT\s+ON\b/i,
  // ADD COLUMN is only additive/backward-compatible when it's nullable or
  // carries a DEFAULT — a bare NOT NULL column without a default breaks the
  // previous app version's INSERTs, so that shape falls through to manual review.
  /^ALTER\s+TABLE\b[^;]*\bADD\s+COLUMN\b[^;]*\bDEFAULT\b/i,
  /^ALTER\s+TABLE\b(?!.*\bNOT\s+NULL\b)[^;]*\bADD\s+COLUMN\b/i,
  // This repo's own idiom for guarded FK additions (see migration.sql files
  // under apps/api/prisma/migrations): a DO $$ block that only ever adds a
  // FOREIGN KEY constraint behind an IF NOT EXISTS check.
  /^DO\s+\$\$[\s\S]*?\bADD\s+CONSTRAINT\b[\s\S]*?\bFOREIGN\s+KEY\b[\s\S]*?\$\$\s*;?$/i,
];

const DO_BLOCK_PATTERN = /DO\s+\$\$[\s\S]*?\$\$\s*;/gi;
const PLACEHOLDER_PREFIX = 'SIGNALKIT_DO_BLOCK_';

/**
 * Splits SQL into top-level statements, treating a `DO $$ ... $$` block as
 * one atomic statement (it may contain internal semicolons that must not be
 * split on). Strategy: pull out every `DO $$ ... $$` block first (replacing
 * it with a placeholder token), split what's left on `;`, then restore the
 * blocks as whole statements.
 */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const doBlocks: string[] = [];
  const placeholderText = withoutComments.replace(DO_BLOCK_PATTERN, (match) => {
    const token = `${PLACEHOLDER_PREFIX}${doBlocks.length};`;
    doBlocks.push(match.trim());
    return token;
  });

  return placeholderText
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      if (s.startsWith(PLACEHOLDER_PREFIX)) {
        const index = Number(s.slice(PLACEHOLDER_PREFIX.length));
        return doBlocks[index] ?? '';
      }
      return `${s};`;
    });
}

/** Classifies a single migration.sql file's contents. */
export function classifyMigrationSafety(sql: string): MigrationSafetyClass {
  const trimmed = sql.trim();
  if (!trimmed) return 'none';

  if (DESTRUCTIVE_PATTERNS.some((p) => p.test(trimmed))) {
    return 'destructive_blocked';
  }

  const statements = splitStatements(trimmed);
  if (statements.length === 0) return 'none';

  const allRecognizedSafe = statements.every((statement) =>
    SAFE_ADDITIVE_PATTERNS.some((p) => p.test(statement)),
  );

  return allRecognizedSafe ? 'safe_additive_candidate' : 'manual_review_required';
}

/**
 * Classifies a whole change (possibly several new migration files) as the
 * worst (most conservative) classification across all of them. No migration
 * files at all → 'none'.
 */
export function classifyMigrationFiles(files: Array<{ path: string; content: string }>): MigrationSafetyClass {
  const migrationFiles = files.filter((f) => /prisma[\\/]migrations[\\/].*\.sql$/i.test(f.path));
  if (migrationFiles.length === 0) return 'none';

  const rank: Record<MigrationSafetyClass, number> = {
    safe_additive_candidate: 0,
    none: 0,
    manual_review_required: 1,
    destructive_blocked: 2,
  };

  let worst: MigrationSafetyClass = 'safe_additive_candidate';
  for (const file of migrationFiles) {
    const cls = classifyMigrationSafety(file.content);
    if (rank[cls] > rank[worst]) worst = cls;
  }
  return worst;
}

/** L2.1 state machine — stops at `human_review_pending`. Later states exist
 * in the schema so L2.3 doesn't need another migration, but are unreachable
 * until deploy/rollback are implemented. */
export type SelfImprovementRunStatus =
  | 'proposed'
  | 'generating'
  | 'testing'
  | 'review_pending'
  | 'human_review_pending'
  | 'failed'
  | 'rolled_back'
  | 'circuit_broken';

export interface ReviewFinding {
  file: string;
  line?: number;
  summary: string;
  category: string;
  verdict: 'CONFIRMED' | 'PLAUSIBLE';
  /** Set true for security/auth/tenant-isolation/migration/deployment findings
   * even at PLAUSIBLE — these must not be silently treated as safe. */
  requiresHumanReview?: boolean;
}
