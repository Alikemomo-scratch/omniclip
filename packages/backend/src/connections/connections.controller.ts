import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, UpdateConnectionDto } from './dto';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  /**
   * GET /connections — List all connections for the current user.
   */
  @Get()
  async findAll(@Request() req: { user: { userId: string } }) {
    const connections = await this.connectionsService.findAll(req.user.userId);
    return { connections };
  }

  /**
   * POST /connections — Create a new platform connection.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: { user: { userId: string } }, @Body() dto: CreateConnectionDto) {
    return this.connectionsService.create(req.user.userId, dto);
  }

  /**
   * PATCH /connections/:id — Update connection settings.
   */
  @Patch(':id')
  async update(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.connectionsService.update(req.user.userId, id, dto);
  }

  /**
   * DELETE /connections/:id — Disconnect a platform.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    await this.connectionsService.remove(req.user.userId, id);
  }

  /**
   * POST /connections/:id/test — Test connection health.
   */
  @Post(':id/test')
  async testConnection(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.connectionsService.testConnection(req.user.userId, id);
  }
}
