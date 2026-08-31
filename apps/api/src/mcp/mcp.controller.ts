import { Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { McpAuthService } from './mcp-auth.service';
import { McpServerService } from './mcp-server.service';

/**
 * The remote MCP endpoint. Authentication is two-layered: the global
 * JwtAuthGuard already rejects a missing/invalid bearer token before this
 * controller runs; McpAuthService.verifyRequest then re-checks the token is
 * specifically an MCP access token (`aud: 'mcp'`) and that its
 * McpClientSession is still live — this second check is what makes
 * revocation take effect before the JWT's own expiry.
 *
 * Stateless Streamable HTTP: a fresh McpServer + transport is built per
 * request (`sessionIdGenerator: undefined`), scoped to the caller's
 * workspace/scopes. No SDK-level session concept is used — McpClientSession
 * is the only session that matters here.
 */
@ApiExcludeController()
@Controller()
export class McpController {
  constructor(
    private readonly mcpAuth: McpAuthService,
    private readonly mcpServer: McpServerService,
  ) {}

  @Post('mcp')
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.dispatch(req, res);
  }

  @Get('mcp')
  async handleGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.dispatch(req, res);
  }

  @Delete('mcp')
  async handleDelete(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.dispatch(req, res);
  }

  private async dispatch(req: Request, res: Response): Promise<void> {
    // Throws (UnauthorizedException) if missing/invalid/revoked/expired —
    // Nest's exception filter formats the response since res hasn't been
    // touched yet at this point.
    const ctx = await this.mcpAuth.verifyRequest(req);

    const server = this.mcpServer.build(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get('workspaces/:workspaceId/mcp/sessions')
  @RequirePermissions('workspace:read')
  listSessions(@Param('workspaceId') workspaceId: string) {
    return this.mcpAuth.listSessions(workspaceId);
  }

  @Delete('workspaces/:workspaceId/mcp/sessions/:id')
  @RequirePermissions('workspace:read')
  async revokeSession(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.mcpAuth.revokeSession(workspaceId, id, user.sub);
    return { id, revoked: true };
  }
}
