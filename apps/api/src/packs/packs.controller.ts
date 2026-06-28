import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LocaleCode } from '@signalkit/shared';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { PackService } from './pack.service';
import { GeneratePackDto } from './dto/pack.dto';

@ApiTags('packs')
@Controller('workspaces/:workspaceId')
export class PacksController {
  constructor(private readonly packs: PackService) {}

  @Post('niches/:nicheId/generate-pack')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Generate a Product Document Pack for a niche' })
  generate(@Param('workspaceId') ws: string, @Param('nicheId') nicheId: string, @Body() dto: GeneratePackDto) {
    return this.packs.generate(ws, nicheId, { depth: dto.depth, vertical: dto.vertical, language: dto.language as LocaleCode | undefined, useLlm: dto.useLlm });
  }

  @Get('niches/:nicheId/packs')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List packs for a niche' })
  list(@Param('workspaceId') ws: string, @Param('nicheId') nicheId: string) {
    return this.packs.listForNiche(ws, nicheId);
  }

  @Get('packs/:packId')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get a pack with documents + quality gate' })
  get(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.getPack(ws, packId);
  }

  @Get('packs/:packId/documents')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List a pack’s documents' })
  documents(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.documents(ws, packId);
  }

  @Post('packs/:packId/run-quality-gates')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Re-run quality gates over the pack' })
  runGates(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.runGates(ws, packId);
  }

  @Get('packs/:packId/build-blueprint')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get the Build Blueprint (screen contracts, state matrix, API↔screen map, build readiness)' })
  blueprint(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.getBlueprint(ws, packId);
  }

  @Post('packs/:packId/build-blueprint/regenerate')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Regenerate the Build Blueprint from the current pack context' })
  regenerateBlueprint(@Param('workspaceId') ws: string, @Param('packId') packId: string) {
    return this.packs.regenerateBlueprint(ws, packId);
  }
}
