import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentService } from './content.service';
import { ContentQueryDto } from './dto';

@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  /**
   * GET /content — List content items with pagination and filters.
   */
  @Get()
  async findAll(@Request() req: { user: { userId: string } }, @Query() query: ContentQueryDto) {
    return this.contentService.findAll(req.user.userId, query);
  }

  /**
   * GET /content/:id — Get a single content item.
   */
  @Get(':id')
  async findById(@Request() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.contentService.findById(req.user.userId, id);
  }
}
