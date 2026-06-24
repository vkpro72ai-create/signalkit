import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [SettingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
