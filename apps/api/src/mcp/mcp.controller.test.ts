import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpController } from './mcp.controller';
import { McpAuthService } from './mcp-auth.service';
import { McpServerService } from './mcp-server.service';
import { McpToolsService } from './mcp-tools.service';
import type { SelfImproveToolsService } from '../self-improve/self-improve-tools.service';
import type { SelfImproveAuthzService } from '../self-improve/self-improve-authz.service';
import type { PermissionsService } from '../permissions/permissions.service';
import type { AuditService } from '../audit/audit.service';

function makeSelfImproveTools(opts: { isSuperadmin?: boolean } = {}) {
  const authz = { isSuperadmin: vi.fn().mockReturnValue(opts.isSuperadmin ?? false) } as unknown as SelfImproveAuthzService;
  const tools = {
    proposeChange: vi.fn(),
    getPipelineStatus: vi.fn(),
    listRecentChanges: vi.fn(),
  } as unknown as SelfImproveToolsService;
  return { tools, authz };
}

function makeToolsService() {
  const permissions = { can: vi.fn().mockResolvedValue(true) } as unknown as PermissionsService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const workspaces = {
    getById: vi.fn().mockResolvedValue({ id: 'ws1', name: 'Acme Lab', slug: 'acme', settings: null }),
  } as never;
  const noop = {
    listForWorkspace: vi.fn(), getById: vi.fn(), listAll: vi.fn(), get: vi.fn(), ventureThesis: vi.fn(),
    getPack: vi.fn(), getDiagnosticsForPack: vi.fn(), create: vi.fn(), setArchived: vi.fn(), discover: vi.fn(),
    createFromIdea: vi.fn(), upsertFounderVerdict: vi.fn(), promote: vi.fn(), getJob: vi.fn(),
  } as never;
  return new McpToolsService(permissions, audit, workspaces, noop, noop, noop, noop, noop, noop, noop);
}

/** The transport defaults to SSE responses (not enableJsonResponse) — parse the
 * `data: {...}` line out of the event-stream body, which is what a real client does. */
async function readSseJson<T>(res: globalThis.Response): Promise<T> {
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error(`No SSE data line in response: ${text}`);
  return JSON.parse(line.slice('data: '.length)) as T;
}

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer((req, res) => {
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('McpController — authentication', () => {
  it('rejects a request with no bearer token', async () => {
    const mcpAuth = { verifyRequest: vi.fn().mockRejectedValue(new UnauthorizedException('Missing bearer token')) } as unknown as McpAuthService;
    const si = makeSelfImproveTools();
    const controller = new McpController(mcpAuth, new McpServerService(makeToolsService(), si.tools, si.authz));
    const req = { headers: {} } as unknown as Request;
    const res = {} as unknown as Response;
    await expect(controller.handlePost(req, res)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request whose session was revoked', async () => {
    const mcpAuth = { verifyRequest: vi.fn().mockRejectedValue(new UnauthorizedException('MCP session is revoked or expired')) } as unknown as McpAuthService;
    const si = makeSelfImproveTools();
    const controller = new McpController(mcpAuth, new McpServerService(makeToolsService(), si.tools, si.authz));
    const req = { headers: { authorization: 'Bearer revoked-session-token' } } as unknown as Request;
    const res = {} as unknown as Response;
    await expect(controller.handlePost(req, res)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('McpController — Streamable HTTP handshake (real transport, mocked app services)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts initialize and lists all 18 Phase A1 + Phase B tools', async () => {
    const mcpAuth = {
      verifyRequest: vi.fn().mockResolvedValue({
        sessionId: 's1',
        workspaceId: 'ws1',
        userId: 'user1',
        scopes: [
          'workspace:read', 'project:read', 'project:create', 'project:update',
          'niche:read', 'niche:discover', 'pack:read', 'pack:edit', 'pack:generate',
          'pack:approve', 'comment:create', 'export:read', 'export:create',
        ],
        clientName: 'Test Client',
      }),
    } as unknown as McpAuthService;
    const si = makeSelfImproveTools();
    const controller = new McpController(mcpAuth, new McpServerService(makeToolsService(), si.tools, si.authz));

    await withServer(
      (req, res) => {
        void controller.handlePost(req as unknown as Request, res as unknown as Response);
      },
      async (baseUrl) => {
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer valid',
        };

        const initRes = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'test-client', version: '0.0.1' },
            },
          }),
        });
        expect(initRes.status).toBe(200);
        const initBody = await readSseJson<{ result: { serverInfo: { name: string } } }>(initRes);
        expect(initBody.result.serverInfo.name).toBe('signalkit');

        const listRes = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
        });
        expect(listRes.status).toBe(200);
        const listBody = await readSseJson<{ result: { tools: Array<{ name: string }> } }>(listRes);
        const names = listBody.result.tools.map((t) => t.name).sort();
        expect(names).toEqual(
          [
            'get_generation_status',
            'get_opportunity',
            'get_product_pack',
            'get_project',
            'get_research',
            'get_workspace_context',
            'list_opportunities',
            'list_research',
            'create_research',
            'archive_research',
            'discover_opportunities',
            'create_opportunity_from_idea',
            'set_opportunity_verdict',
            'save_research_note',
            'start_pack_generation',
            'promote_to_project',
            'create_export',
            'get_export',
          ].sort(),
        );
      },
    );
  });

  it('lists the 3 self-improve tools too, but only for a session with SELF_IMPROVE_SCOPE granted to an allowlisted superadmin', async () => {
    const mcpAuth = {
      verifyRequest: vi.fn().mockResolvedValue({
        sessionId: 's1',
        workspaceId: 'ws1',
        userId: 'superadmin-user',
        scopes: ['workspace:read', 'signalkit:self:propose'],
        clientName: 'Ops Console',
      }),
    } as unknown as McpAuthService;
    const si = makeSelfImproveTools({ isSuperadmin: true });
    const controller = new McpController(mcpAuth, new McpServerService(makeToolsService(), si.tools, si.authz));

    await withServer(
      (req, res) => {
        void controller.handlePost(req as unknown as Request, res as unknown as Response);
      },
      async (baseUrl) => {
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer valid',
        };
        const listRes = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
        const listBody = await readSseJson<{ result: { tools: Array<{ name: string }> } }>(listRes);
        const names = listBody.result.tools.map((t) => t.name);
        expect(names).toEqual(
          expect.arrayContaining(['signalkit_self_propose_change', 'signalkit_self_get_pipeline_status', 'signalkit_self_list_recent_changes']),
        );
      },
    );
  });

  it('does NOT list the self-improve tools for a session that lacks SELF_IMPROVE_SCOPE, even if the user happens to be a superadmin', async () => {
    const mcpAuth = {
      verifyRequest: vi.fn().mockResolvedValue({
        sessionId: 's1',
        workspaceId: 'ws1',
        userId: 'superadmin-user',
        scopes: ['workspace:read'],
        clientName: 'Ops Console',
      }),
    } as unknown as McpAuthService;
    const si = makeSelfImproveTools({ isSuperadmin: true });
    const controller = new McpController(mcpAuth, new McpServerService(makeToolsService(), si.tools, si.authz));

    await withServer(
      (req, res) => {
        void controller.handlePost(req as unknown as Request, res as unknown as Response);
      },
      async (baseUrl) => {
        const headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer valid',
        };
        const listRes = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
        const listBody = await readSseJson<{ result: { tools: Array<{ name: string }> } }>(listRes);
        const names = listBody.result.tools.map((t) => t.name);
        expect(names).not.toEqual(expect.arrayContaining(['signalkit_self_propose_change']));
      },
    );
  });
});
