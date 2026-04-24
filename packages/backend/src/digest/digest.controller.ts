import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { DigestService } from './digest.service';
import { GenerateDigestDto, DigestQueryDto } from './dto';
import { UsersService } from '../users/users.service';

@Controller('digests')
@UseGuards(AuthGuard('jwt'))
export class DigestController {
  constructor(
    private readonly digestService: DigestService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * GET /digests — List digests with pagination and optional type filter.
   */
  @Get()
  async list(@Req() req: Request, @Query() query: DigestQueryDto) {
    const userId = (req.user as { userId: string }).userId;
    return this.digestService.findAll(userId, query);
  }

  /**
   * POST /digests/generate — Manually trigger digest generation.
   * Returns 202 Accepted with the digest ID.
   */
  @Post('generate')
  @HttpCode(202)
  async generate(@Req() req: Request, @Body() dto: GenerateDigestDto) {
    const userId = (req.user as { userId: string }).userId;

    // Get user's language preference
    const user = await this.usersService.findById(userId);
    const language = user?.preferred_language ?? 'zh';

    // Fire-and-forget: start generation in background
    const digestId = await this.digestService.generateDigest(
      userId,
      dto.digest_type,
      new Date(dto.period_start),
      new Date(dto.period_end),
      language,
    );

    return {
      id: digestId,
      status: 'pending',
      message: 'Digest generation queued',
    };
  }

  /**
   * GET /digests/:id — Get a single digest with full content.
   */
  @Get(':id')
  async findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    const digest = await this.digestService.findById(userId, id);
    if (!digest) {
      throw new NotFoundException('Digest not found');
    }
    return digest;
  }

  @Patch(':id/archive')
  @HttpCode(204)
  async archive(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    await this.digestService.archive(userId, id);
  }

  @Patch(':id/unarchive')
  @HttpCode(204)
  async unarchive(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    await this.digestService.unarchive(userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;
    await this.digestService.remove(userId, id);
  }

  /**
   * GET /digests/:id/stream — SSE for real-time generation progress.
   */
  @Get(':id/stream')
  async stream(@Req() req: Request, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    const userId = (req.user as { userId: string }).userId;

    // Check digest exists
    const digest = await this.digestService.findById(userId, id);
    if (!digest) {
      throw new NotFoundException('Digest not found');
    }

    // If already completed, send final event and close
    if (digest.status === 'completed') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(
        `event: complete\ndata: ${JSON.stringify({ digest_id: id, status: 'completed' })}\n\n`,
      );
      res.end();
      return;
    }

    if (digest.status === 'failed') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`event: error\ndata: ${JSON.stringify({ digest_id: id, status: 'failed' })}\n\n`);
      res.end();
      return;
    }

    // For pending/generating digests, set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Poll the digest status periodically
    const interval = setInterval(async () => {
      try {
        const current = await this.digestService.findById(userId, id);
        if (!current) {
          clearInterval(interval);
          res.write(`event: error\ndata: ${JSON.stringify({ error: 'Digest not found' })}\n\n`);
          res.end();
          return;
        }

        if (current.status === 'completed') {
          clearInterval(interval);
          res.write(
            `event: complete\ndata: ${JSON.stringify({ digest_id: id, status: 'completed' })}\n\n`,
          );
          res.end();
          return;
        }

        if (current.status === 'failed') {
          clearInterval(interval);
          res.write(
            `event: error\ndata: ${JSON.stringify({ digest_id: id, status: 'failed' })}\n\n`,
          );
          res.end();
          return;
        }

        // Send keepalive
        res.write(
          `event: progress\ndata: ${JSON.stringify({ stage: current.status, progress: 0.5 })}\n\n`,
        );
      } catch {
        clearInterval(interval);
        res.end();
      }
    }, 2000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(interval);
    });
  }
}
