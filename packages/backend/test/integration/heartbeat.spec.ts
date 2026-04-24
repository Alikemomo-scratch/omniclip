/**
 * T035: Integration test for heartbeat endpoint
 * Tests: POST /api/v1/sync/heartbeat per extension-sync.md.
 * Verify connection status update on error report.
 * Uses Testcontainers (PostgreSQL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { DatabaseModule } from '../../src/common/database/database.module';
import { ConnectionsModule } from '../../src/connections/connections.module';
import { ConnectorsModule } from '../../src/connectors/connectors.module';
import { ContentModule } from '../../src/content/content.module';
import { SyncModule } from '../../src/sync/sync.module';
import {
  startTestDatabase,
  createTestApp,
  truncateAllTables,
  stopTestDatabase,
} from '../helpers/test-db';

describe('Heartbeat Endpoint (Integration)', () => {
  let app: INestApplication;
  let connectionString: string;
  let testPool: Pool;

  /**
   * Helper: register user + create extension connection.
   */
  async function setupUserWithExtensionConnection(
    email: string,
    name: string,
    platform: 'twitter' = 'twitter',
  ) {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', display_name: name });
    const token = regRes.body.access_token;
    const userId = regRes.body.user.id;

    const connRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform, connection_type: 'extension' });

    return { token, userId, connectionId: connRes.body.id };
  }

  beforeAll(async () => {
    const result = await startTestDatabase();
    connectionString = result.connectionString;
    testPool = result.pool;

    app = await createTestApp(
      [
        DatabaseModule,
        AuthModule,
        UsersModule,
        ConnectionsModule,
        ConnectorsModule,
        ContentModule,
        SyncModule,
      ],
      connectionString,
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(testPool);
  });

  // ── Auth Validation ──

  it('should reject unauthenticated heartbeat with 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/sync/heartbeat').send({
      connection_id: '00000000-0000-0000-0000-000000000001',
      platform: 'twitter',
      status: 'active',
    });

    expect(res.status).toBe(401);
  });

  it('should reject heartbeat for non-existent connection with 404', async () => {
    const { token } = await setupUserWithExtensionConnection('hb1@ext.com', 'HB1');

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: randomUUID(),
        platform: 'twitter',
        status: 'active',
      });

    expect(res.status).toBe(404);
  });

  // ── Active Heartbeat ──

  it('should acknowledge active heartbeat and return sync interval', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection('hb2@ext.com', 'HB2');

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: connectionId,
        platform: 'twitter',
        status: 'active',
        last_collection_at: new Date().toISOString(),
        items_buffered: 3,
      })
      .expect(200);

    expect(res.body.ack).toBe(true);
    expect(res.body.sync_interval_minutes).toBeGreaterThan(0);
    expect(res.body.connection_status).toBe('active');
  });

  it('should update last_sync_at on active heartbeat', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection('hb3@ext.com', 'HB3');

    await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: connectionId,
        platform: 'twitter',
        status: 'active',
      })
      .expect(200);

    // Verify the connection was updated
    const connRes = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const conn = connRes.body.connections.find((c: { id: string }) => c.id === connectionId);
    expect(conn).toBeDefined();
    expect(conn.last_sync_at).not.toBeNull();
    expect(conn.status).toBe('active');
  });

  // ── Error Heartbeat ──

  it('should update connection to error status on error heartbeat', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection('hb4@ext.com', 'HB4');

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: connectionId,
        platform: 'twitter',
        status: 'error',
        error_type: 'auth_expired',
        error_message: 'Platform login session expired',
      })
      .expect(200);

    expect(res.body.ack).toBe(true);
    expect(res.body.connection_status).toBe('error');

    // Verify connection in DB
    const connRes = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const conn = connRes.body.connections.find((c: { id: string }) => c.id === connectionId);
    expect(conn.status).toBe('error');
    expect(conn.last_error).toBe('Platform login session expired');
  });

  it('should increment error_count on consecutive error heartbeats', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection('hb5@ext.com', 'HB5');

    // Send 3 error heartbeats
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/sync/heartbeat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          connection_id: connectionId,
          platform: 'twitter',
          status: 'error',
          error_message: `Error attempt ${i + 1}`,
        })
        .expect(200);
    }

    // Check the connection via the connections endpoint (which includes error_count)
    // We need to get the connection details — use the findById endpoint
    const connRes = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(connRes.body.error_count).toBe(3);
    expect(connRes.body.status).toBe('error');
  });

  it('should reset error_count on active heartbeat after errors', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection('hb6@ext.com', 'HB6');

    // Send error heartbeat
    await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: connectionId,
        platform: 'twitter',
        status: 'error',
        error_message: 'Some error',
      })
      .expect(200);

    // Send active heartbeat to recover
    await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: connectionId,
        platform: 'twitter',
        status: 'active',
      })
      .expect(200);

    // Verify error_count is reset
    const connRes = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(connRes.body.error_count).toBe(0);
    expect(connRes.body.status).toBe('active');
    expect(connRes.body.last_error).toBeNull();
  });

  // ── RLS Isolation ──

  it('should prevent user A from sending heartbeat to user B connection', async () => {
    const userA = await setupUserWithExtensionConnection('hbA@ext.com', 'HBA');
    const userB = await setupUserWithExtensionConnection('hbB@ext.com', 'HBB');

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        connection_id: userB.connectionId,
        platform: 'twitter',
        status: 'active',
      });

    // RLS prevents user A from seeing user B's connection
    expect(res.status).toBe(404);
  });

  // ── Validation ──

  it('should reject heartbeat with invalid platform', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection(
      'hbval@ext.com',
      'HBVal',
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/heartbeat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        connection_id: connectionId,
        platform: 'invalid_platform',
        status: 'active',
      });

    expect(res.status).toBe(400);
  });
});
