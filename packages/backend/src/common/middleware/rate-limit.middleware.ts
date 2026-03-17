import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('redis.url') || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async use(req: Request, res: Response, next: NextFunction) {
    let identifier = req.ip || req.socket.remoteAddress || 'unknown';

    // Extract user ID from JWT if present
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.userId) {
          identifier = decoded.userId;
        }
      } catch (e) {
        // ignore invalid tokens, fallback to IP
      }
    }

    // Default rate limits
    let limit = 200;
    const windowSecs = 60; // 1 minute window

    // URL format is typically /api/v1/group/...
    const parts = req.path.split('/');
    const group = parts.length > 3 ? parts[3] : 'general';

    // Configurable limits per endpoint group
    if (group === 'auth') {
      limit = 20; // Stricter limit for auth endpoints
    } else if (group === 'digests' && req.method === 'POST') {
      limit = 5; // AI generation is expensive
    } else if (req.path.includes('/sync')) {
      limit = 10; // Sync endpoints
    }

    const key = `ratelimit:${identifier}:${group}`;

    try {
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, windowSecs);
      }

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));

      if (current > limit) {
        throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
      }

      next();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // If redis fails, log and fail open
      console.error('Rate Limiter Redis Error:', e);
      next();
    }
  }
}
