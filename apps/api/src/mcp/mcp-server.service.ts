import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { McpAuthContext } from './mcp-auth.service';
import { McpToolsService } from './mcp-tools.service';

function toResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const MARKET_SCOPES = ['current_location', 'country_of_residence', 'manual_country', 'manual_region', 'multi_country', 'global'] as const;
const RISK_TOLERANCE = ['low', 'medium', 'high'] as const;
const EVIDENCE_MODE = ['starter_hypothesis', 'source_backed', 'deep_research'] as const;
const FOUNDER_DECISION = ['undecided', 'explore', 'generate_pack', 'postpone', 'reject', 'ready_to_commit'] as const;
const RESEARCH_UPDATE_TYPE = [
  'customer_interview', 'competitor_note', 'landing_result', 'survey_result', 'pricing_feedback',
  'legal_note', 'local_market_note', 'investor_feedback', 'internal_team_note', 'ai_agent_implementation_feedback',
] as const;
const PACK_DEPTH = ['quick_opportunity', 'build_ready', 'investor_grade', 'agency_client', 'ai_agent_engineering'] as const;
const VERTICAL_TEMPLATE = [
  'b2b_saas', 'mobile_consumer_app', 'marketplace', 'ai_agent_product', 'api_product',
  'community_content_product', 'local_service_saas', 'compliance_saas', 'health_adjacent_product',
  'fintech_adjacent_product', 'ecommerce_tool', 'creator_economy_tool', 'internal_enterprise_tool',
] as const;
const AMBITION_MODE = ['cash_flow_business', 'venture_scale', 'unicorn_ambition'] as const;
const EXPORT_TYPE = [
  'full_pdf_pack', 'founder_summary_pdf', 'investor_memo_pdf', 'pm_brief', 'designer_brd', 'frontend_brd',
  'backend_brd', 'growth_brief', 'sales_brief', 'ai_agent_engineering_bundle', 'markdown_zip', 'json_bundle',
  'evidence_appendix', 'source_appendix', 'roadmap_pdf', 'client_agency_export',
] as const;
const ROLE_BRIEF_TYPE = ['founder', 'pm', 'designer', 'frontend', 'backend', 'growth', 'sales', 'investor', 'ai_agent'] as const;

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
          'Cursor configurations) access to one authenticated workspace, scoped to exactly what this ' +
          'connection was granted: reading research context, opportunities, Product Packs, generation ' +
          'status and promoted implementation projects; and — where granted — running the operator loop ' +
          '(create/discover opportunities, save research notes, start Product Pack generation, promote to ' +
          'an implementation project, export). Every write/execute tool goes through the same gates the web ' +
          'app enforces (discovery brief, quality gate, founder promotion gate) and cannot bypass them. ' +
          'Tools that require explicit human confirmation (discover_opportunities with confirmReplace, ' +
          'promote_to_project) must only be called with that confirmation set true when the user actually ' +
          'gave it in this conversation, never on the assistant\'s own judgment.',
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

    // ── Phase B: operator write/execute tools ─────────────────────────────

    server.registerTool(
      'create_research',
      {
        title: 'Create a research context',
        description: 'Create a new research/opportunity-search context in the connected workspace.',
        inputSchema: {
          name: z.string().min(2).describe('Short name for this research context'),
          goal: z.string().optional().describe('What this research is trying to find'),
          marketScope: z.enum(MARKET_SCOPES).optional(),
          targetCountry: z.string().optional().describe('ISO 3166-1 alpha-2'),
          targetRegion: z.string().optional().describe('ISO 3166-2'),
          targetCountries: z.array(z.string()).optional(),
          targetRegions: z.array(z.string()).optional(),
          marketLanguage: z.string().optional(),
        },
      },
      async (args) => toResult(await this.tools.createResearch(ctx, args)),
    );

    server.registerTool(
      'archive_research',
      {
        title: 'Archive or reactivate a research context',
        description: 'Hide a research context from the default list (or bring it back). Reversible.',
        inputSchema: {
          researchId: z.string().min(1),
          archived: z.boolean().describe('true to archive, false to reactivate'),
        },
      },
      async (args) => toResult(await this.tools.archiveResearch(ctx, args)),
    );

    server.registerTool(
      'discover_opportunities',
      {
        title: 'Discover opportunities',
        description:
          'Run gated opportunity discovery for a research context. Requires at least one of directions/audiences/productFormats ' +
          '(the same brief-completeness gate the web app enforces) — ask the user for these first if missing, never invent them. ' +
          'If the research context already has opportunities, this REPLACES them (cascades to their Product Packs) — only pass ' +
          'confirmReplace: true if the user explicitly said to replace them in this conversation.',
        inputSchema: {
          researchId: z.string().min(1),
          directions: z.array(z.string()).optional().describe('Topic/direction hints — required (with audiences/productFormats) unless the user already set them'),
          audiences: z.array(z.string()).optional(),
          productFormats: z.array(z.string()).optional(),
          subthemes: z.array(z.string()).optional(),
          verticals: z.array(z.string()).optional(),
          market: z.string().optional(),
          locations: z.array(z.string()).optional(),
          riskTolerance: z.enum(RISK_TOLERANCE).optional(),
          evidenceMode: z.enum(EVIDENCE_MODE).optional(),
          language: z.string().optional(),
          confirmReplace: z.boolean().optional().describe('Must be true (and only true on explicit user instruction) to replace existing opportunities'),
        },
      },
      async (args) => toResult(await this.tools.discoverOpportunities(ctx, args)),
    );

    server.registerTool(
      'create_opportunity_from_idea',
      {
        title: 'Develop a founder idea into a scored opportunity',
        description: 'Turn a specific founder-supplied idea into one scored opportunity, without touching existing opportunities.',
        inputSchema: {
          researchId: z.string().min(1),
          founderIdea: z.string().min(40).describe('The founder\'s own idea text, verbatim, at least 40 characters'),
          targetMarket: z.string().optional(),
          targetAudience: z.string().optional(),
          productFormat: z.string().optional(),
          outputLanguage: z.string().optional(),
          evidenceMode: z.enum(EVIDENCE_MODE).optional(),
          riskTolerance: z.enum(RISK_TOLERANCE).optional(),
        },
      },
      async (args) => toResult(await this.tools.createOpportunityFromIdea(ctx, args)),
    );

    server.registerTool(
      'set_opportunity_verdict',
      {
        title: 'Set the founder\'s verdict on an opportunity',
        description:
          'Record the connected user\'s own personal rating/decision on an opportunity (separate from its AI score). ' +
          'Only set this from something the user actually said, never from the AI\'s own assessment.',
        inputSchema: {
          opportunityId: z.string().min(1),
          rating: z.number().int().min(1).max(5).optional(),
          comment: z.string().optional(),
          decision: z.enum(FOUNDER_DECISION).optional(),
        },
      },
      async (args) => toResult(await this.tools.setOpportunityVerdict(ctx, args)),
    );

    server.registerTool(
      'save_research_note',
      {
        title: 'Save a research note',
        description: 'Save a finding (interview, competitor note, evidence, etc.) against a Product Pack\'s research trail.',
        inputSchema: {
          packId: z.string().min(1),
          title: z.string().min(1),
          type: z.enum(RESEARCH_UPDATE_TYPE),
          content: z.string().min(1),
          language: z.string().optional(),
          marketContext: z.string().optional(),
        },
      },
      async (args) => toResult(await this.tools.saveResearchNote(ctx, args)),
    );

    server.registerTool(
      'start_pack_generation',
      {
        title: 'Start Product Pack generation',
        description:
          'Start async Product Pack generation for an opportunity (takes ~20-25 minutes; poll get_generation_status). ' +
          'strong_model mode is only available if the environment has it configured, and fails clearly if not.',
        inputSchema: {
          opportunityId: z.string().min(1),
          depth: z.enum(PACK_DEPTH),
          vertical: z.enum(VERTICAL_TEMPLATE),
          language: z.string().optional(),
          generationMode: z.enum(['standard', 'strong_model']).optional(),
        },
      },
      async (args) => toResult(await this.tools.startPackGeneration(ctx, args)),
    );

    server.registerTool(
      'promote_to_project',
      {
        title: 'Promote a Product Pack to an implementation project',
        description:
          'Promote a Build-Ready pack into a real, founder-committed implementation project. Requires the pack to already ' +
          'be Build-Ready (system gate) and requires commitmentConfirmed + reviewedRisks to be true (founder gate) — these ' +
          'must reflect an explicit commitment the user just gave in this conversation. Never set them true on your own ' +
          'judgment; ask the user to confirm first. A high AI score never substitutes for this.',
        inputSchema: {
          packId: z.string().min(1),
          ambitionMode: z.enum(AMBITION_MODE),
          commitmentConfirmed: z.boolean().describe('The user just explicitly confirmed a real commitment to build this'),
          reviewedRisks: z.boolean().describe('The user just explicitly confirmed they reviewed the top risks'),
        },
      },
      async (args) => toResult(await this.tools.promoteToProject(ctx, args)),
    );

    server.registerTool(
      'create_export',
      {
        title: 'Create an export',
        description: 'Start an export job for a Product Pack (PDF, markdown, role-specific briefs, etc). Async — poll get_export.',
        inputSchema: {
          packId: z.string().min(1),
          type: z.enum(EXPORT_TYPE),
          language: z.string().optional(),
          roleBrief: z.enum(ROLE_BRIEF_TYPE).optional(),
          applyBranding: z.boolean().optional(),
        },
      },
      async (args) => toResult(await this.tools.createExport(ctx, args)),
    );

    server.registerTool(
      'get_export',
      {
        title: 'Get export status',
        description: 'Get the status of an export job, and its download artifact once ready.',
        inputSchema: { exportId: z.string().min(1) },
      },
      async (args) => toResult(await this.tools.getExport(ctx, args)),
    );

    return server;
  }
}
