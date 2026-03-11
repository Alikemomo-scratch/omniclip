import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectorRegistry } from '../connectors/connector.registry';

// Mock Drizzle query builder
function createMockDb() {
  const mockTx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  };

  const db = {
    transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
      // Simulate set_config call within transaction
      return cb(mockTx);
    }),
  };

  return { db, mockTx };
}

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let registry: ConnectorRegistry;
  let db: ReturnType<typeof createMockDb>['db'];
  let mockTx: ReturnType<typeof createMockDb>['mockTx'];

  beforeEach(() => {
    const mocks = createMockDb();
    db = mocks.db;
    mockTx = mocks.mockTx;
    registry = new ConnectorRegistry();
    service = new ConnectionsService(db as any, registry);
  });

  describe('findAll', () => {
    it('should return all connections for user', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          platform: 'github',
          connection_type: 'api',
          status: 'active',
          sync_interval_minutes: 60,
          last_sync_at: null,
          last_error: null,
          created_at: new Date(),
        },
      ];

      mockTx.from.mockReturnValue(mockConnections);

      const result = await service.findAll('user-1');
      expect(result).toEqual(mockConnections);
      expect(db.transaction).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    it('should create a new connection', async () => {
      // No existing connection
      mockTx.where.mockResolvedValueOnce([]);

      const created = {
        id: 'conn-new',
        platform: 'github',
        connection_type: 'api',
        status: 'active',
        sync_interval_minutes: 60,
      };
      mockTx.returning.mockResolvedValueOnce([created]);

      const result = await service.create('user-1', {
        platform: 'github',
        connection_type: 'api',
        auth_data: { personal_access_token: 'ghp_xxx' },
      });

      expect(result).toEqual(created);
    });

    it('should throw ConflictException for duplicate platform', async () => {
      // Existing connection found
      mockTx.where.mockResolvedValueOnce([{ id: 'existing' }]);

      await expect(
        service.create('user-1', {
          platform: 'github',
          connection_type: 'api',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('should return connection by ID', async () => {
      const conn = {
        id: 'conn-1',
        platform: 'github',
        connection_type: 'api',
        status: 'active',
        sync_interval_minutes: 60,
        last_sync_at: null,
        last_error: null,
        error_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockTx.where.mockResolvedValueOnce([conn]);

      const result = await service.findById('user-1', 'conn-1');
      expect(result).toEqual(conn);
    });

    it('should throw NotFoundException when not found', async () => {
      mockTx.where.mockResolvedValueOnce([]);

      await expect(service.findById('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update connection settings', async () => {
      // Exists check
      mockTx.where.mockResolvedValueOnce([{ id: 'conn-1' }]);

      const updated = {
        id: 'conn-1',
        platform: 'github',
        connection_type: 'api',
        status: 'active',
        sync_interval_minutes: 120,
        last_sync_at: null,
        last_error: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockTx.returning.mockResolvedValueOnce([updated]);

      const result = await service.update('user-1', 'conn-1', {
        sync_interval_minutes: 120,
      });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent', async () => {
      mockTx.where.mockResolvedValueOnce([]);

      await expect(
        service.update('user-1', 'nonexistent', {
          sync_interval_minutes: 120,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete connection', async () => {
      mockTx.where
        .mockResolvedValueOnce([{ id: 'conn-1' }]) // exists check
        .mockResolvedValueOnce(undefined); // delete

      await service.remove('user-1', 'conn-1');
      expect(mockTx.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting non-existent', async () => {
      mockTx.where.mockResolvedValueOnce([]);

      await expect(service.remove('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('testConnection', () => {
    it('should call connector healthCheck', async () => {
      const conn = {
        id: 'conn-1',
        platform: 'github',
        connection_type: 'api',
        status: 'active',
        sync_interval_minutes: 60,
        last_sync_at: null,
        last_error: null,
        error_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockTx.where.mockResolvedValueOnce([conn]);

      const mockConnector = {
        platform: 'github' as const,
        type: 'api' as const,
        healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', message: 'OK' }),
        fetchContent: vi.fn(),
        parseResponse: vi.fn(),
      };
      registry.register(mockConnector);

      const result = await service.testConnection('user-1', 'conn-1');
      expect(result).toEqual({ status: 'healthy', message: 'OK' });
      expect(mockConnector.healthCheck).toHaveBeenCalled();
    });
  });
});
