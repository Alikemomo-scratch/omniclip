import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExtensionSyncService } from './extension-sync.service';
import { ExtensionSyncDto, HeartbeatDto } from './dto';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class ExtensionSyncController {
  constructor(private readonly extensionSyncService: ExtensionSyncService) {}

  /**
   * POST /api/v1/sync/extension — Batch upload content items from the extension.
   * Returns 200 for full success, 207 for partial success (some items had validation errors).
   */
  @Post('extension')
  async syncExtension(
    @Request() req: { user: { userId: string } },
    @Body() dto: ExtensionSyncDto,
    @Res() res: Response,
  ) {
    const result = await this.extensionSyncService.processSync(req.user.userId, dto);

    // 207 Multi-Status if there were any errors alongside accepted items
    const statusCode = result.errors.length > 0 && result.accepted > 0 ? 207 : HttpStatus.OK;

    return res.status(statusCode).json(result);
  }

  /**
   * POST /api/v1/sync/heartbeat — Extension health report.
   */
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(@Request() req: { user: { userId: string } }, @Body() dto: HeartbeatDto) {
    return this.extensionSyncService.processHeartbeat(req.user.userId, dto);
  }
}
