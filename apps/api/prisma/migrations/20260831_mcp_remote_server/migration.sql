-- Phase A1: Remote MCP server — OAuth 2.1 client registrations, authorization
-- codes, connected-client sessions, and refresh tokens. Additive only. Does
-- not alter UserLLMConnection, WorkspaceLLMSettings, or any Product Pack
-- generation table. Idempotent (IF NOT EXISTS) to match this repo's
-- migration style for a shared/managed Postgres instance.

CREATE TABLE IF NOT EXISTS "McpOAuthClient" (
    "id"                      TEXT NOT NULL,
    "clientName"              TEXT NOT NULL,
    "redirectUris"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "grantTypes"              TEXT[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token']::TEXT[],
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "softwareId"              TEXT,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "McpAuthorizationCode" (
    "id"                  TEXT NOT NULL,
    "codeHash"            TEXT NOT NULL,
    "clientId"            TEXT NOT NULL,
    "workspaceId"         TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "redirectUri"         TEXT NOT NULL,
    "codeChallenge"       TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "scopes"              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expiresAt"           TIMESTAMP(3) NOT NULL,
    "consumedAt"          TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpAuthorizationCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "McpAuthorizationCode_codeHash_key" ON "McpAuthorizationCode"("codeHash");
CREATE INDEX IF NOT EXISTS "McpAuthorizationCode_clientId_idx" ON "McpAuthorizationCode"("clientId");

CREATE TABLE IF NOT EXISTS "McpClientSession" (
    "id"                TEXT NOT NULL,
    "workspaceId"       TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "clientId"          TEXT NOT NULL,
    "clientName"        TEXT NOT NULL DEFAULT 'unknown',
    "clientVersion"     TEXT,
    "scopes"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "capabilityProfile" JSONB NOT NULL DEFAULT '{}',
    "issuedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"         TIMESTAMP(3) NOT NULL,
    "lastSeenAt"        TIMESTAMP(3),
    "revokedAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpClientSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "McpClientSession_workspaceId_idx" ON "McpClientSession"("workspaceId");
CREATE INDEX IF NOT EXISTS "McpClientSession_userId_idx" ON "McpClientSession"("userId");

CREATE TABLE IF NOT EXISTS "McpRefreshToken" (
    "id"          TEXT NOT NULL,
    "tokenHash"   TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "sessionId"   TEXT NOT NULL,
    "scopes"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "revokedAt"   TIMESTAMP(3),
    "lastUsedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpRefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "McpRefreshToken_tokenHash_key" ON "McpRefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "McpRefreshToken_clientId_idx" ON "McpRefreshToken"("clientId");
CREATE INDEX IF NOT EXISTS "McpRefreshToken_sessionId_idx" ON "McpRefreshToken"("sessionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpAuthorizationCode_clientId_fkey'
  ) THEN
    ALTER TABLE "McpAuthorizationCode"
      ADD CONSTRAINT "McpAuthorizationCode_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpAuthorizationCode_workspaceId_fkey'
  ) THEN
    ALTER TABLE "McpAuthorizationCode"
      ADD CONSTRAINT "McpAuthorizationCode_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpAuthorizationCode_userId_fkey'
  ) THEN
    ALTER TABLE "McpAuthorizationCode"
      ADD CONSTRAINT "McpAuthorizationCode_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpClientSession_workspaceId_fkey'
  ) THEN
    ALTER TABLE "McpClientSession"
      ADD CONSTRAINT "McpClientSession_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpClientSession_userId_fkey'
  ) THEN
    ALTER TABLE "McpClientSession"
      ADD CONSTRAINT "McpClientSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpRefreshToken_clientId_fkey'
  ) THEN
    ALTER TABLE "McpRefreshToken"
      ADD CONSTRAINT "McpRefreshToken_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpRefreshToken_workspaceId_fkey'
  ) THEN
    ALTER TABLE "McpRefreshToken"
      ADD CONSTRAINT "McpRefreshToken_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpRefreshToken_userId_fkey'
  ) THEN
    ALTER TABLE "McpRefreshToken"
      ADD CONSTRAINT "McpRefreshToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'McpRefreshToken_sessionId_fkey'
  ) THEN
    ALTER TABLE "McpRefreshToken"
      ADD CONSTRAINT "McpRefreshToken_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "McpClientSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
