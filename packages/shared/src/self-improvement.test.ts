import { describe, it, expect } from 'vitest';
import { classifyMigrationFiles, classifyMigrationSafety } from './self-improvement.js';

describe('classifyMigrationSafety', () => {
  it('empty/whitespace-only SQL is none', () => {
    expect(classifyMigrationSafety('')).toBe('none');
    expect(classifyMigrationSafety('   \n  ')).toBe('none');
  });

  it('a bare CREATE TABLE IF NOT EXISTS is safe_additive_candidate', () => {
    expect(
      classifyMigrationSafety(`
        CREATE TABLE IF NOT EXISTS "Widget" (
          "id" TEXT NOT NULL,
          CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
        );
      `),
    ).toBe('safe_additive_candidate');
  });

  it('CREATE INDEX and CREATE UNIQUE INDEX IF NOT EXISTS are safe', () => {
    expect(classifyMigrationSafety('CREATE INDEX IF NOT EXISTS "Widget_x_idx" ON "Widget"("x");')).toBe('safe_additive_candidate');
    expect(classifyMigrationSafety('CREATE UNIQUE INDEX "Widget_y_key" ON "Widget"("y");')).toBe('safe_additive_candidate');
  });

  it('ADD COLUMN with a DEFAULT is safe; a nullable ADD COLUMN with no default is also safe', () => {
    expect(classifyMigrationSafety('ALTER TABLE "Widget" ADD COLUMN "flag" BOOLEAN NOT NULL DEFAULT false;')).toBe('safe_additive_candidate');
    expect(classifyMigrationSafety('ALTER TABLE "Widget" ADD COLUMN "note" TEXT;')).toBe('safe_additive_candidate');
  });

  it('ADD COLUMN ... NOT NULL with no default breaks the previous app version — manual review, not safe', () => {
    expect(classifyMigrationSafety('ALTER TABLE "Widget" ADD COLUMN "required" TEXT NOT NULL;')).toBe('manual_review_required');
  });

  it('this repo\'s own guarded DO-block FK-addition idiom is recognized as safe', () => {
    const sql = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'Widget_ownerId_fkey'
        ) THEN
          ALTER TABLE "Widget"
            ADD CONSTRAINT "Widget_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `;
    expect(classifyMigrationSafety(sql)).toBe('safe_additive_candidate');
  });

  it('a real migration from this repo (VentureThesis/BuildBlueprint, 20260629) classifies as safe_additive_candidate', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS "VentureThesis" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          CONSTRAINT "VentureThesis_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "VentureThesis_nicheId_idx" ON "VentureThesis"("nicheId");

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'VentureThesis_nicheId_fkey'
        ) THEN
          ALTER TABLE "VentureThesis"
            ADD CONSTRAINT "VentureThesis_nicheId_fkey"
            FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `;
    expect(classifyMigrationSafety(sql)).toBe('safe_additive_candidate');
  });

  it.each([
    ['DROP TABLE "Widget";'],
    ['ALTER TABLE "Widget" DROP COLUMN "x";'],
    ['ALTER TABLE "Widget" DROP CONSTRAINT "Widget_pkey";'],
    ['DROP INDEX "Widget_x_idx";'],
    ['TRUNCATE "Widget";'],
    ['DELETE FROM "Widget" WHERE 1=1;'],
    ['ALTER TABLE "Widget" RENAME COLUMN "x" TO "y";'],
    ['ALTER TABLE "Widget" ALTER COLUMN "x" SET NOT NULL;'],
    ['ALTER TABLE "Widget" ALTER COLUMN "x" TYPE INTEGER;'],
  ])('destructive statement %s is always destructive_blocked, never inferred safe', (sql) => {
    expect(classifyMigrationSafety(sql)).toBe('destructive_blocked');
  });

  it('an unrecognized statement shape (e.g. CREATE FUNCTION) is manual_review_required, not inferred safe just because nothing destructive matched', () => {
    expect(
      classifyMigrationSafety(`
        CREATE OR REPLACE FUNCTION widget_touch() RETURNS trigger AS $$
        BEGIN
          NEW."updatedAt" = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `),
    ).toBe('manual_review_required');
  });

  it('a mix of one safe statement and one unrecognized statement is manual_review_required (conservative — worst wins)', () => {
    expect(
      classifyMigrationSafety(`
        CREATE TABLE IF NOT EXISTS "Widget" ("id" TEXT NOT NULL);
        CREATE OR REPLACE VIEW widget_view AS SELECT * FROM "Widget";
      `),
    ).toBe('manual_review_required');
  });

  it('a mix of a safe statement and a destructive one is destructive_blocked (destructive always wins)', () => {
    expect(
      classifyMigrationSafety(`
        CREATE TABLE IF NOT EXISTS "Widget" ("id" TEXT NOT NULL);
        DROP TABLE "OldWidget";
      `),
    ).toBe('destructive_blocked');
  });
});

describe('classifyMigrationFiles', () => {
  it('no migration files at all is none', () => {
    expect(classifyMigrationFiles([{ path: 'apps/api/src/foo.ts', content: 'DROP TABLE "x";' }])).toBe('none');
  });

  it('only scans files under prisma/migrations/**.sql, ignoring app code even if it contains SQL-looking text', () => {
    expect(
      classifyMigrationFiles([
        { path: 'apps/api/src/some.service.ts', content: 'const sql = "DROP TABLE x";' },
      ]),
    ).toBe('none');
  });

  it('reports the worst classification across multiple migration files in one change', () => {
    const result = classifyMigrationFiles([
      { path: 'apps/api/prisma/migrations/20260901_a/migration.sql', content: 'CREATE TABLE IF NOT EXISTS "A" ("id" TEXT NOT NULL);' },
      { path: 'apps/api/prisma/migrations/20260901_b/migration.sql', content: 'DROP TABLE "B";' },
    ]);
    expect(result).toBe('destructive_blocked');
  });

  it('handles Windows-style backslash paths the same as forward slashes', () => {
    const result = classifyMigrationFiles([
      { path: 'apps\\api\\prisma\\migrations\\20260901_a\\migration.sql', content: 'DROP TABLE "A";' },
    ]);
    expect(result).toBe('destructive_blocked');
  });
});
