import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@signalkit/shared';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';
import { PermissionsService } from '../permissions.service';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Enforces @RequirePermissions on a route. Resolves the target workspace from
 * the route params (`:id` for /workspaces/:id, or `:workspaceId`) or the request
 * body, then checks the caller's role against the shared RBAC matrix.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRE_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const workspaceId = this.resolveWorkspaceId(request);
    if (!workspaceId) {
      throw new ForbiddenException('Workspace context required for this action');
    }

    const allowed = await this.permissions.can(userId, workspaceId, required);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }

  private resolveWorkspaceId(request: AuthenticatedRequest): string | null {
    const params = (request.params ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const query = (request.query ?? {}) as Record<string, unknown>;
    return (
      params['workspaceId'] ??
      params['id'] ??
      (typeof body['workspaceId'] === 'string' ? body['workspaceId'] : undefined) ??
      (typeof query['workspaceId'] === 'string' ? (query['workspaceId'] as string) : undefined) ??
      null
    );
  }
}
