import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'List audit events for a workspace' })
  list(
    @Query('workspaceId') workspaceId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.list(
      workspaceId,
      page ? Number.parseInt(page, 10) : 1,
      pageSize ? Number.parseInt(pageSize, 10) : 50,
    );
  }
}
