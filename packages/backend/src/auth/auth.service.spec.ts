import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { DRIZZLE } from '../common/database/database.constants';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: vi.fn(),
}));

function createMockDb() {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  return {
    select: vi.fn().mockReturnValue(chainable),
    insert: vi.fn().mockReturnValue(chainable),
    _chainable: chainable,
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let mockDb: ReturnType<typeof createMockDb>;
  let jwtService: JwtService;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              jwt: {
                secret: 'test-secret',
                expiration: '15m',
                refreshExpiration: '7d',
              },
            }),
          ],
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([]);
      mockDb._chainable.returning.mockResolvedValueOnce([
        { id: 'user-1', email: 'test@example.com', displayName: 'Test User' },
      ]);

      const result = await authService.register('test@example.com', 'password123', 'Test User');

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.display_name).toBe('Test User');
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(typeof result.access_token).toBe('string');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([{ id: 'existing-user' }]);

      await expect(
        authService.register('exists@example.com', 'password123', 'Test'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'test@example.com',
          passwordHash: '$2b$12$hashedpassword',
          displayName: 'Test User',
        },
      ]);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

      const result = await authService.login('test@example.com', 'password123');

      expect(result.user.email).toBe('test@example.com');
      expect(result.access_token).toBeDefined();
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([]);

      await expect(authService.login('noone@example.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'test@example.com',
          passwordHash: '$2b$12$hashedpassword',
          displayName: 'Test User',
        },
      ]);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

      await expect(authService.login('test@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('should return new tokens for valid refresh token', async () => {
      // Generate a real refresh token first
      const token = jwtService.sign(
        { sub: 'user-1', email: 'test@example.com' },
        { expiresIn: '7d' },
      );

      mockDb._chainable.limit.mockResolvedValueOnce([{ id: 'user-1', email: 'test@example.com' }]);

      const result = await authService.refresh(token);

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      await expect(authService.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
