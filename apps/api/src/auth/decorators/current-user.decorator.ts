import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../auth.service';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/** Injects the authenticated user's JWT payload into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error('CurrentUser used on an unauthenticated route');
    }
    return request.user;
  },
);
