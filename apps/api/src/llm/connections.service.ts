import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createAdapter, type ConnectionConfig } from '@signalkit/llm';
import type { LLMProviderType } from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import type { ConnectProviderDto, TestProviderDto } from './dto/llm.dto';

@Injectable()
export class LlmConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Strip the encrypted secret before anything leaves the service. */
  private sanitize<T extends { encryptedKey?: string }>(conn: T): Omit<T, 'encryptedKey'> {
    const { encryptedKey: _encryptedKey, ...safe } = conn;
    return safe;
  }

  async list(workspaceId: string) {
    const rows = await this.prisma.userLLMConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.sanitize(r));
  }

  /** Connect a provider: encrypt the key, store masked display, audit. */
  async connect(dto: ConnectProviderDto, userId: string) {
    const encryptedKey = this.crypto.encrypt(dto.apiKey);
    const maskedKey = this.crypto.mask(dto.apiKey);

    const conn = await this.prisma.userLLMConnection.create({
      data: {
        workspaceId: dto.workspaceId,
        userId: dto.userScoped ? userId : null,
        provider: dto.provider,
        label: dto.label,
        encryptedKey,
        maskedKey,
        baseUrl: dto.baseUrl ?? null,
        status: 'active',
      },
    });

    await this.audit.record({
      workspaceId: dto.workspaceId,
      action: 'llm.connection_created',
      actorId: userId,
      subjectType: 'UserLLMConnection',
      subjectId: conn.id,
      metadata: { provider: dto.provider, maskedKey }, // never the raw key
    });

    return this.sanitize(conn);
  }

  /** Test a raw key WITHOUT storing it (pre-save validation). */
  async testRaw(dto: TestProviderDto) {
    const config: ConnectionConfig = {
      provider: dto.provider as LLMProviderType,
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl ?? null,
    };
    const adapter = createAdapter(config);
    return adapter.testConnection();
  }

  /** Test a stored connection by id; updates lastTestedAt/status. */
  async testStored(id: string, workspaceId: string) {
    const conn = await this.requireConn(id, workspaceId);
    const adapter = createAdapter({
      provider: conn.provider as LLMProviderType,
      apiKey: this.crypto.decrypt(conn.encryptedKey),
      baseUrl: conn.baseUrl,
    });
    const result = await adapter.testConnection();
    await this.prisma.userLLMConnection.update({
      where: { id },
      data: { lastTestedAt: new Date(), status: result.ok ? 'active' : 'invalid' },
    });
    return result;
  }

  async remove(id: string, workspaceId: string, userId: string) {
    await this.requireConn(id, workspaceId);
    await this.prisma.userLLMConnection.delete({ where: { id } });
    await this.audit.record({
      workspaceId,
      action: 'llm.connection_revoked',
      actorId: userId,
      subjectType: 'UserLLMConnection',
      subjectId: id,
    });
    return { ok: true };
  }

  private async requireConn(id: string, workspaceId: string) {
    const conn = await this.prisma.userLLMConnection.findUnique({ where: { id } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.workspaceId !== workspaceId) {
      throw new ForbiddenException('Connection belongs to another workspace');
    }
    return conn;
  }
}
