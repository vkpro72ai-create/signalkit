import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../permissions/decorators/require-permissions.decorator';
import { GovernanceService } from './governance.service';
import { ResearchService } from './research.service';
import { CommentsService } from './comments.service';
import {
  CreateCommentDto,
  CreateResearchUpdateDto,
  RegenerateAffectedDto,
  RestoreVersionDto,
  SaveDocumentDto,
  UpdateResearchUpdateDto,
  ValidateAssumptionDto,
} from './dto/governance.dto';

interface AuthReq {
  user: { sub: string };
  // WorkspaceId is resolved by PermissionsGuard from route params
}

@ApiTags('governance')
@Controller('workspaces/:workspaceId')
export class GovernanceController {
  constructor(
    private readonly gov: GovernanceService,
    private readonly research: ResearchService,
    private readonly comments: CommentsService,
  ) {}

  // ── Document editing ───────────────────────────────────────────────────────

  @Put('packs/:packId/documents/:documentId')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Save document body (creates a version snapshot)' })
  save(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Body() dto: SaveDocumentDto,
    @Req() req: AuthReq,
  ) {
    return this.gov.saveDocument(ws, packId, docId, req.user.sub, dto);
  }

  // ── Versioning ─────────────────────────────────────────────────────────────

  @Get('packs/:packId/documents/:documentId/versions')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List versions for a document' })
  listVersions(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
  ) {
    return this.gov.listVersions(ws, packId, docId);
  }

  @Get('packs/:packId/documents/:documentId/versions/:versionId')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get a specific document version' })
  getVersion(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.gov.getVersion(ws, packId, docId, versionId);
  }

  @Post('packs/:packId/documents/:documentId/restore-version')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Restore document to a previous version' })
  restoreVersion(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Body() dto: RestoreVersionDto,
    @Req() req: AuthReq,
  ) {
    return this.gov.restoreVersion(ws, packId, docId, req.user.sub, dto.versionId);
  }

  // ── Review workflow ────────────────────────────────────────────────────────

  @Post('packs/:packId/documents/:documentId/request-review')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Request a document review' })
  requestReview(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.setReviewStatus(ws, packId, docId, req.user.sub, 'request_review', false);
  }

  @Post('packs/:packId/documents/:documentId/approve')
  @RequirePermissions('pack:approve')
  @ApiOperation({ summary: 'Approve a document' })
  approve(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.setReviewStatus(ws, packId, docId, req.user.sub, 'approve', true);
  }

  @Post('packs/:packId/documents/:documentId/request-changes')
  @RequirePermissions('pack:approve')
  @ApiOperation({ summary: 'Request changes on a document' })
  requestChanges(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.setReviewStatus(ws, packId, docId, req.user.sub, 'request_changes', true);
  }

  @Post('packs/:packId/documents/:documentId/lock')
  @RequirePermissions('pack:approve')
  @ApiOperation({ summary: 'Lock an approved document' })
  lock(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.setReviewStatus(ws, packId, docId, req.user.sub, 'lock', true);
  }

  @Post('packs/:packId/documents/:documentId/archive')
  @RequirePermissions('pack:approve')
  @ApiOperation({ summary: 'Archive a document' })
  archive(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.setReviewStatus(ws, packId, docId, req.user.sub, 'archive', true);
  }

  // ── Research Updates ───────────────────────────────────────────────────────

  @Post('packs/:packId/research-updates')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Add a research update to a pack' })
  createResearchUpdate(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Body() dto: CreateResearchUpdateDto,
    @Req() req: AuthReq,
  ) {
    return this.research.create(ws, packId, req.user.sub, dto);
  }

  @Get('packs/:packId/research-updates')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List research updates for a pack' })
  listResearchUpdates(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
  ) {
    return this.research.list(ws, packId);
  }

  @Get('packs/:packId/research-updates/:id')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'Get a research update' })
  getResearchUpdate(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('id') id: string,
  ) {
    return this.research.get(ws, packId, id);
  }

  @Put('packs/:packId/research-updates/:id')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Update a research update' })
  updateResearchUpdate(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('id') id: string,
    @Body() dto: UpdateResearchUpdateDto,
  ) {
    return this.research.update(ws, packId, id, dto);
  }

  // ── Assumptions ────────────────────────────────────────────────────────────

  @Get('packs/:packId/assumptions')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List assumptions referenced by pack documents' })
  packAssumptions(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
  ) {
    return this.gov.getPackAssumptions(ws, packId);
  }

  @Put('assumptions/:assumptionId/validation')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Update an assumption validation status' })
  validateAssumption(
    @Param('workspaceId') ws: string,
    @Param('assumptionId') assumptionId: string,
    @Body() dto: ValidateAssumptionDto,
  ) {
    return this.gov.validateAssumption(ws, assumptionId, dto);
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  @Post('packs/:packId/documents/:documentId/comments')
  @RequirePermissions('comment:create')
  @ApiOperation({ summary: 'Add a comment to a document' })
  createComment(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthReq,
  ) {
    return this.comments.create(ws, packId, docId, req.user.sub, dto.body);
  }

  @Get('packs/:packId/documents/:documentId/comments')
  @RequirePermissions('pack:read')
  @ApiOperation({ summary: 'List comments on a document' })
  listComments(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
  ) {
    return this.comments.list(ws, packId, docId);
  }

  @Post('comments/:commentId/resolve')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Resolve a comment' })
  resolveComment(
    @Param('workspaceId') ws: string,
    @Param('commentId') commentId: string,
    @Req() req: AuthReq,
  ) {
    return this.comments.resolve(ws, commentId, req.user.sub);
  }

  @Post('comments/:commentId/reopen')
  @RequirePermissions('pack:edit')
  @ApiOperation({ summary: 'Reopen a resolved comment' })
  reopenComment(
    @Param('workspaceId') ws: string,
    @Param('commentId') commentId: string,
  ) {
    return this.comments.reopen(ws, commentId);
  }

  // ── Regeneration ───────────────────────────────────────────────────────────

  @Post('packs/:packId/documents/:documentId/regenerate')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Regenerate a single document (creates version)' })
  regenerateDocument(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Param('documentId') docId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.regenerateDocument(ws, packId, docId, req.user.sub);
  }

  @Post('packs/:packId/regenerate-affected')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Regenerate documents linked to a research update' })
  regenerateAffected(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Body() dto: RegenerateAffectedDto,
    @Req() req: AuthReq,
  ) {
    return this.gov.regenerateAffected(ws, packId, req.user.sub, dto.researchUpdateId);
  }

  @Post('packs/:packId/regenerate-weak-sections')
  @RequirePermissions('pack:generate')
  @ApiOperation({ summary: 'Regenerate documents that failed quality gates' })
  regenerateWeak(
    @Param('workspaceId') ws: string,
    @Param('packId') packId: string,
    @Req() req: AuthReq,
  ) {
    return this.gov.regenerateWeakSections(ws, packId, req.user.sub);
  }
}
