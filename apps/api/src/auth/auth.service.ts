import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';
import type { RegisterDto, LoginDto } from './dto/auth.dto';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Register a new user, create default settings and first workspace. */
  async register(dto: RegisterDto): Promise<{ accessToken: string; userId: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName ?? null,
        settings: { create: {} },
      },
    });

    // Auto-provision first workspace so mobile is self-starting (no "go to web" dead end)
    const name = 'My Product Lab';
    const slug = `lab-${user.id.slice(-8)}`;
    await this.prisma.workspace.create({
      data: {
        name,
        slug,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'owner', status: 'active' } },
        settings: { create: {} },
        llmSettings: { create: {} },
        billingAccount: { create: { plan: 'free' } },
      },
    });

    return this.issueToken(user.id, user.email);
  }

  /** Verify credentials and issue a token. Generic error to avoid user enumeration. */
  async login(dto: LoginDto): Promise<{ accessToken: string; userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await verifyPassword(dto.password, user.passwordHash);
    if (!ok || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(user.id, user.email);
  }

  private issueToken(userId: string, email: string): { accessToken: string; userId: string } {
    const payload: JwtPayload = { sub: userId, email };
    return { accessToken: this.jwt.sign(payload), userId };
  }
}
