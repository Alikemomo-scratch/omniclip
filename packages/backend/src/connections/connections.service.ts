import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../common/database/database.constants';
import type { DrizzleDB } from '../common/database/rls.middleware';
import { withRlsContext } from '../common/database/rls.middleware';
import { platformConnections } from '../common/database/schema';
import { ConnectorRegistry } from '../connectors/connector.registry';
import type { CreateConnectionDto, UpdateConnectionDto } from './dto';

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly connectorRegistry: ConnectorRegistry,
  ) {}

  /**
   * List all connections for the given user (RLS-scoped).
   */
  async findAll(userId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      return tx
        .select({
          id: platformConnections.id,
          platform: platformConnections.platform,
          connection_type: platformConnections.connectionType,
          status: platformConnections.status,
          sync_interval_minutes: platformConnections.syncIntervalMinutes,
          last_sync_at: platformConnections.lastSyncAt,
          last_error: platformConnections.lastError,
          created_at: platformConnections.createdAt,
        })
        .from(platformConnections);
    });
  }

  /**
   * Create a new platform connection.
   */
  async create(userId: string, dto: CreateConnectionDto) {
    return withRlsContext(this.db, userId, async (tx) => {
      // Check for duplicate
      const existing = await tx
        .select({ id: platformConnections.id })
        .from(platformConnections)
        .where(
          and(
            eq(platformConnections.userId, userId),
            eq(platformConnections.platform, dto.platform),
          ),
        );

      if (existing.length > 0) {
        throw new ConflictException(`Platform ${dto.platform} is already connected`);
      }

      const [connection] = await tx
        .insert(platformConnections)
        .values({
          userId,
          platform: dto.platform,
          connectionType: dto.connection_type,
          status: 'active',
          authData: dto.auth_data || null,
          syncIntervalMinutes: dto.sync_interval_minutes || 60,
        })
        .returning({
          id: platformConnections.id,
          platform: platformConnections.platform,
          connection_type: platformConnections.connectionType,
          status: platformConnections.status,
          sync_interval_minutes: platformConnections.syncIntervalMinutes,
        });

      return connection;
    });
  }

  /**
   * List all registered platforms.
   */
  listPlatforms() {
    return this.connectorRegistry.listRegistered();
  }

  /**
   * Get a single connection by ID (RLS-scoped).
   */
  async findById(userId: string, connectionId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      const [connection] = await tx
        .select({
          id: platformConnections.id,
          platform: platformConnections.platform,
          connection_type: platformConnections.connectionType,
          status: platformConnections.status,
          sync_interval_minutes: platformConnections.syncIntervalMinutes,
          last_sync_at: platformConnections.lastSyncAt,
          last_error: platformConnections.lastError,
          error_count: platformConnections.errorCount,
          created_at: platformConnections.createdAt,
          updated_at: platformConnections.updatedAt,
        })
        .from(platformConnections)
        .where(eq(platformConnections.id, connectionId));

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      return connection;
    });
  }

  /**
   * Update a connection's settings.
   */
  async update(userId: string, connectionId: string, dto: UpdateConnectionDto) {
    return withRlsContext(this.db, userId, async (tx) => {
      // Verify it exists and belongs to user (RLS handles ownership)
      const [existing] = await tx
        .select({ id: platformConnections.id })
        .from(platformConnections)
        .where(eq(platformConnections.id, connectionId));

      if (!existing) {
        throw new NotFoundException('Connection not found');
      }

      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (dto.auth_data !== undefined) {
        updateValues.authData = dto.auth_data;
      }
      if (dto.sync_interval_minutes !== undefined) {
        updateValues.syncIntervalMinutes = dto.sync_interval_minutes;
      }

      const [updated] = await tx
        .update(platformConnections)
        .set(updateValues)
        .where(eq(platformConnections.id, connectionId))
        .returning({
          id: platformConnections.id,
          platform: platformConnections.platform,
          connection_type: platformConnections.connectionType,
          status: platformConnections.status,
          sync_interval_minutes: platformConnections.syncIntervalMinutes,
          last_sync_at: platformConnections.lastSyncAt,
          last_error: platformConnections.lastError,
          created_at: platformConnections.createdAt,
          updated_at: platformConnections.updatedAt,
        });

      return updated;
    });
  }

  /**
   * Delete a connection.
   */
  async remove(userId: string, connectionId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      const [existing] = await tx
        .select({ id: platformConnections.id })
        .from(platformConnections)
        .where(eq(platformConnections.id, connectionId));

      if (!existing) {
        throw new NotFoundException('Connection not found');
      }

      await tx.delete(platformConnections).where(eq(platformConnections.id, connectionId));
    });
  }

  /**
   * Test a connection's health by invoking the connector's healthCheck.
   */
  async testConnection(userId: string, connectionId: string) {
    // Use findByIdWithAuth to get auth_data — needed by connectors like YouTube
    const connection = await this.findByIdWithAuth(userId, connectionId);

    const connector = this.connectorRegistry.get(
      connection.platform as 'github' | 'youtube' | 'twitter' | 'xiaohongshu',
    );

    return connector.healthCheck({
      id: connection.id,
      user_id: userId,
      platform: connection.platform as 'github' | 'youtube' | 'twitter' | 'xiaohongshu',
      connection_type: connection.connectionType as 'api' | 'extension',
      status: connection.status as 'active' | 'error' | 'disconnected',
      auth_data: (connection.authData as Record<string, unknown>) || null,
      sync_interval_minutes: connection.syncIntervalMinutes,
      last_sync_at: connection.lastSyncAt,
    });
  }

  /**
   * Get full connection data including auth_data (for internal sync use only).
   */
  async findByIdWithAuth(userId: string, connectionId: string) {
    return withRlsContext(this.db, userId, async (tx) => {
      const [connection] = await tx
        .select()
        .from(platformConnections)
        .where(eq(platformConnections.id, connectionId));

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      return connection;
    });
  }
}
