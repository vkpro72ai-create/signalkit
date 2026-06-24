import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

/** Global so guards and feature modules can inject PermissionsService. */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
