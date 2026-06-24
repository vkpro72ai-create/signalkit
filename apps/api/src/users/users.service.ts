import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current user with settings and workspace memberships (for GET /me). */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        memberships: {
          where: { status: 'active' },
          include: { workspace: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return {
      user: safeUser,
      settings: user.settings,
      memberships: user.memberships.map((m) => ({ workspace: m.workspace, role: m.role })),
    };
  }
}
