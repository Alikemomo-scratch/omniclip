import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentService } from './content.service';
import { ContentQueryDto } from './dto';

@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  async findAll(@Request() req: { user: { userId: string } }, @Query() query: ContentQueryDto) {
    return this.contentService.findAll(req.user.userId, query);
  }

  @Get(':id')
  async findById(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contentService.findById(req.user.userId, id);
  }

  @Patch(':id/archive')
  @HttpCode(204)
  async archive(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contentService.archive(req.user.userId, id);
  }

  @Patch(':id/unarchive')
  @HttpCode(204)
  async unarchive(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contentService.unarchive(req.user.userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Request() req: { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contentService.remove(req.user.userId, id);
  }
}
