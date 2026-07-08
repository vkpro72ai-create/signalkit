import { Body, Controller, ForbiddenException, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { UpdateUserSettingsDto } from '../settings/dto/settings.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly settings: SettingsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user, settings and workspace memberships' })
  me(@CurrentUser() user: JwtPayload) {
    return this.users.getMe(user.sub);
  }

  @Get('me/entitlements')
  @ApiOperation({ summary: 'Current user entitlements (plan, features)' })
  entitlements(@CurrentUser() user: JwtPayload) {
    return this.users.getEntitlements(user.sub);
  }

  @Get('users/:id/settings')
  @ApiOperation({ summary: 'Get a user’s settings (self only)' })
  getSettings(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    this.assertSelf(id, user);
    return this.settings.getUserSettings(id);
  }

  @Put('users/:id/settings')
  @ApiOperation({ summary: 'Update a user’s settings (self only)' })
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateUserSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.assertSelf(id, user);
    return this.settings.updateUserSettings(id, dto);
  }

  private assertSelf(id: string, user: JwtPayload): void {
    if (id !== user.sub) {
      throw new ForbiddenException('You may only manage your own settings');
    }
  }
}
