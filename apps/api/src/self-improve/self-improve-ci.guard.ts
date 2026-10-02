import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { optionalEnv } from '@signalkit/config';

/**
 * Authenticates the GitHub Actions job calling back into the self-improve
 * pipeline controller — a fixed shared secret from a controlled CI
 * environment (GitHub Secrets), never a SignalKit user JWT and never a
 * workspace credential. Fails closed: if the token isn't configured, every
 * CI request is refused rather than silently accepted.
 */
@Injectable()
export class SelfImproveCiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = optionalEnv('SELF_IMPROVEMENT_CI_TOKEN', '');
    if (!configured) {
      throw new UnauthorizedException('Self-improvement CI pipeline is not configured in this environment');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing CI bearer token');
    }
    const provided = header.slice('Bearer '.length);

    const a = Buffer.from(provided);
    const b = Buffer.from(configured);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid CI token');
    }
    return true;
  }
}
