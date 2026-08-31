import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { McpAuthContext } from './mcp-auth.service';
import { McpToolsService } from './mcp-tools.service';

function toResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Builds a fresh, stateless McpServer per request (see mcp.controller.ts —
 * Streamable HTTP runs with `sessionIdGenerator: undefined`). The server
 * instructions text is deliberately capability-based ("any compatible remote
 * MCP client") rather than naming specific products, since this server must
 * stay standards-based and client-agnostic.
 */
@Injectable()
export class McpServerService {
  constructor(private readonly tools: McpToolsService) {}

  build(ctx: McpAuthContext): McpServer {
    const server = new McpServer(
      { name: 'signalkit', version: '1.0.0' },
      {
        instructions:
          'SignalKit is an evidence-backed market opportunity discovery and Product Pack platform. ' +
          'These tools give any compatible remote MCP client (including supported ChatGPT, Claude and ' +
          'Cursor configurations) read access to one authenticated workspace: research context, ' +
          'opportunities, Product Packs, generation status and promoted implementation projects. ' +
          'All data is scoped to the connected workspace and the granted scopes only.',
      },
    );

    server.registerTool(
      'get_workspace_context',
      {
        title: 'Get workspace context',
        description: 'Return the connected SignalKit workspace: name, locale and market defaults, billing plan.',
        inputSchema: {},
      },
      async () => toResult(await this.tools.getWorkspaceContext(ctx)),
    );

    server.registerTool(
      'list_research',
      {
        title: 'List research contexts',
        description: 'List the workspace\'s research/opportunity-search contexts (not archived by default).',
        inputSchema: {},
      },
      async () => toResult(await this.tools.listResearch(ctx)),
    );

    server.registerTool(
      'get_research',
      {
        title: 'Get a research context',
        description: 'Get one research context by id: goal, status, market scope.',
        inputSchema: { researchId: z.string().min(1).describe('Research context id') },
      },
      async (args) => toResult(await this.tools.getResearch(ctx, args)),
    );

    server.registerTool(
      'list_opportunities',
      {
        title: 'List opportunities',
        description:
          'List scored opportunities (niches) in the workspace, optionally scoped to one research context.',
        inputSchema: {
          researchId: z.string().min(1).optional().describe('Optional: limit to one research context'),
        },
      },
      async (args) => toResult(await this.tools.listOpportunities(ctx, args)),
    );

    server.registerTool(
      'get_opportunity',
      {
        title: 'Get an opportunity',
        description:
          'Get one opportunity in full: problem, audience, MVP concept, latest score, and venture thesis if computed.',
        inputSchema: { opportunityId: z.string().min(1).describe('Opportunity (niche) id') },
      },
      async (args) => toResult(await this.tools.getOpportunity(ctx, args)),
    );

    server.registerTool(
      'get_product_pack',
      {
        title: 'Get a Product Pack',
        description: 'Get a Product Pack by id: status, quality gate result, and every generated document.',
        inputSchema: { packId: z.string().min(1).describe('Product Pack id') },
      },
      async (args) => toResult(await this.tools.getProductPack(ctx, args)),
    );

    server.registerTool(
      'get_generation_status',
      {
        title: 'Get Product Pack generation status',
        description: 'Get the latest generation job for a pack: status, progress, and per-step results.',
        inputSchema: { packId: z.string().min(1).describe('Product Pack id') },
      },
      async (args) => toResult(await this.tools.getGenerationStatus(ctx, args)),
    );

    server.registerTool(
      'get_project',
      {
        title: 'Get an implementation project',
        description:
          'Get a founder-committed implementation project by id: readiness snapshots, ambition mode, and lineage back to its research context, opportunity and pack.',
        inputSchema: { projectId: z.string().min(1).describe('Implementation project id') },
      },
      async (args) => toResult(await this.tools.getProject(ctx, args)),
    );

    return server;
  }
}
