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

  return {
    select: vi.fn().mockReturnValue(chainable),
    update: vi.fn().mockReturnValue(chainable),
    _chainable: chainable,
  };
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
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return current user if no fields to update', async () => {
      mockDb._chainable.limit.mockResolvedValueOnce([mockUser]);

      const result = await service.update('user-1', {});

      expect(result.display_name).toBe('Test User');
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist on update', async () => {
      mockDb._chainable.returning.mockResolvedValueOnce([]);

      await expect(service.update('missing', { display_name: 'Name' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
