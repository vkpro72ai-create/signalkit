import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MCP_AUTH_CODE_TTL_SECONDS } from '../mcp.constants';
import { generateOpaqueToken, hashToken } from './oauth-crypto.util';
import type { PendingAuthorizeRequest } from './oauth-consent.service';

export interface IssueCodeInput extends PendingAuthorizeRequest {
  workspaceId: string;
  userId: string;
}

@Injectable()
export class OAuthCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async issueCode(input: IssueCodeInput): Promise<string> {
    const raw = generateOpaqueToken();
    await this.prisma.mcpAuthorizationCode.create({
      data: {
        codeHash: hashToken(raw),
        clientId: input.clientId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + MCP_AUTH_CODE_TTL_SECONDS * 1000),
      },
    });
    return raw;
  }

  /** Single-use: marks the code consumed in the same lookup so a replay is rejected. */
  async consumeCode(rawCode: string, clientId: string, redirectUri: string) {
    const codeHash = hashToken(rawCode);
    const record = await this.prisma.mcpAuthorizationCode.findUnique({ where: { codeHash } });
    if (
      !record ||
      record.consumedAt ||
      record.expiresAt.getTime() < Date.now() ||
      record.clientId !== clientId ||
      record.redirectUri !== redirectUri
    ) {
      throw new UnauthorizedException('Invalid, expired or already-used authorization code');
    }
    await this.prisma.mcpAuthorizationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return record;
  }
}
