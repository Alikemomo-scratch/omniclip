import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SyncScheduler } from './sync.scheduler';
import type { SyncJobQueryDto } from './sync.scheduler';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncScheduler: SyncScheduler) {}

  /**
   * GET /sync/jobs — List recent sync jobs for the current user.
   */
  @Get('jobs')
  async listJobs(@Request() req: { user: { userId: string } }, @Query() query: SyncJobQueryDto) {
    return this.syncScheduler.findRecentJobs(req.user.userId, query);
  }
}
