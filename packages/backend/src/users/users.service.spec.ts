import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { DRIZZLE } from '../common/database/database.constants';

function createMockDb() {
  const chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const db: Record<string, unknown> = {
    select: vi.fn().mockReturnValue(chainable),
    update: vi.fn().mockReturnValue(chainable),
    _chainable: chainable,
    // withRlsContext calls db.transaction(cb) — mock it to invoke cb with a
    // transaction object that has `execute` (for set_config) and query methods.
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txChainable = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => chainable.limit()),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn(() => chainable.returning()),
      };
      const tx = {
        select: vi.fn().mockReturnValue(txChainable),
        update: vi.fn().mockReturnValue(txChainable),
        execute: vi.fn().mockResolvedValue(undefined),
      };
      return cb(tx);
    }),
  };

  return db as typeof db & { _chainable: typeof chainable };
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  preferredLanguage: 'zh',
  digestFrequency: 'daily',
  digestTime: '08:00',
  timezone: 'Asia/Shanghai',
  contentRetentionDays: 90,
  digestPrompt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findById', () => {
    it('should return formatted user', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([mockUser]);

      const result = await service.findById('user-1');

      expect(result.id).toBe('user-1');
      expect(result.email).toBe('test@example.com');
      expect(result.display_name).toBe('Test User');
      expect(result.preferred_language).toBe('zh');
      expect(result.digest_frequency).toBe('daily');
      expect(result.digest_prompt).toBeNull();
    });

    it('should throw NotFoundException for missing user', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([]);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return formatted user', async () => {
      const updated = { ...mockUser, displayName: 'New Name' };
      mockDb._chainable.returning.mockResolvedValueOnce([updated]);

      const result = await service.update('user-1', {
        display_name: 'New Name',
      });

      expect(result.display_name).toBe('New Name');
      // Transaction is called (wraps in withRlsContext)
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should return current user if no fields to update', async () => {
      // When no fields to update, findByIdInTx is called inside the same transaction
      mockDb._chainable.limit.mockResolvedValueOnce([mockUser]);

      const result = await service.update('user-1', {});

      expect(result.display_name).toBe('Test User');
    });

    it('should throw NotFoundException if user does not exist on update', async () => {
      mockDb._chainable.returning.mockResolvedValueOnce([]);

      await expect(service.update('missing', { display_name: 'Name' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update user digest_prompt', async () => {
      const customPrompt = 'My custom Phase 1\n---PHASE_SEPARATOR---\nMy Phase 2';
      mockDb._chainable.returning.mockResolvedValueOnce([{ ...mockUser, digestPrompt: customPrompt }]);

      const result = await service.update('user-1', { digest_prompt: customPrompt });
      expect(result.digest_prompt).toBe(customPrompt);
    });

    it('should clear digest_prompt when set to null', async () => {
      mockDb._chainable.returning.mockResolvedValueOnce([{ ...mockUser, digestPrompt: null }]);

      const result = await service.update('user-1', { digest_prompt: null });
      expect(result.digest_prompt).toBeNull();
    });
  });
});
