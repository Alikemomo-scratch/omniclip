/**
 * T020: Integration test for connection management
 * Tests: create/list/update/delete/test connections.
 *        Verify RLS isolation (user A cannot see user B's connections).
 * Uses Testcontainers (PostgreSQL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';

import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { DatabaseModule } from '../../src/common/database/database.module';
import { ConnectionsModule } from '../../src/connections/connections.module';
import { ConnectorsModule } from '../../src/connectors/connectors.module';
import {
  startTestDatabase,
  createTestApp,
  truncateAllTables,
  stopTestDatabase,
} from '../helpers/test-db';

describe('Connections (Integration)', () => {
  let app: INestApplication;
  let connectionString: string;
  let testPool: Pool;

  // Helper to register a user and return the access token
  async function registerAndGetToken(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', display_name: name });
    return res.body.access_token;
  }

  beforeAll(async () => {
    const result = await startTestDatabase();
    connectionString = result.connectionString;
    testPool = result.pool;

    app = await createTestApp(
      [DatabaseModule, AuthModule, UsersModule, ConnectionsModule, ConnectorsModule],
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

  it('should create a GitHub connection', async () => {
    const token = await registerAndGetToken('alice@example.com', 'Alice');

    const res = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'github',
        connection_type: 'api',
        auth_data: { personal_access_token: 'ghp_test123' },
        sync_interval_minutes: 30,
      })
      .expect(201);

    expect(res.body).toMatchObject({
      platform: 'github',
      connection_type: 'api',
      status: 'active',
      sync_interval_minutes: 30,
    });
    expect(res.body.id).toBeDefined();
  });

  it('should reject duplicate platform connection', async () => {
    const token = await registerAndGetToken('bob@example.com', 'Bob');

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'api' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'api' })
      .expect(409);
  });

  it('should list connections for the current user', async () => {
    const token = await registerAndGetToken('carol@example.com', 'Carol');

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'api' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.connections).toHaveLength(1);
    expect(res.body.connections[0].platform).toBe('github');
  });

  it('should update a connection', async () => {
    const token = await registerAndGetToken('dave@example.com', 'Dave');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'api', sync_interval_minutes: 60 });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/connections/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sync_interval_minutes: 15 })
      .expect(200);

    expect(res.body.sync_interval_minutes).toBe(15);
  });

  it('should delete a connection', async () => {
    const token = await registerAndGetToken('eve@example.com', 'Eve');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'api' });

    await request(app.getHttpServer())
      .delete(`/api/v1/connections/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Should be gone
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listRes.body.connections).toHaveLength(0);
  });

  it('should return 404 when updating non-existent connection', async () => {
    const token = await registerAndGetToken('frank@example.com', 'Frank');

    await request(app.getHttpServer())
      .patch('/api/v1/connections/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ sync_interval_minutes: 15 })
      .expect(404);
  });

  it('should validate connection input', async () => {
    const token = await registerAndGetToken('grace@example.com', 'Grace');

    // Invalid platform
    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'invalid', connection_type: 'api' })
      .expect(400);

    // Invalid connection_type
    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'invalid' })
      .expect(400);

    // sync_interval_minutes out of range
    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'github', connection_type: 'api', sync_interval_minutes: 2 })
      .expect(400);
  });

  it('should isolate connections between users (RLS)', async () => {
    const tokenA = await registerAndGetToken('usera@example.com', 'UserA');
    const tokenB = await registerAndGetToken('userb@example.com', 'UserB');

    // User A creates a GitHub connection
    const connA = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ platform: 'github', connection_type: 'api' })
      .expect(201);

    // User B creates a Twitter connection
    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ platform: 'twitter', connection_type: 'extension' })
      .expect(201);

    // User A should only see their GitHub connection
    const listA = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listA.body.connections).toHaveLength(1);
    expect(listA.body.connections[0].platform).toBe('github');

    // User B should only see their Twitter connection
    const listB = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body.connections).toHaveLength(1);
    expect(listB.body.connections[0].platform).toBe('twitter');

    // User B cannot update User A's connection (should get 404 due to RLS)
    await request(app.getHttpServer())
      .patch(`/api/v1/connections/${connA.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ sync_interval_minutes: 10 })
      .expect(404);

    // User B cannot delete User A's connection (should get 404 due to RLS)
    await request(app.getHttpServer())
      .delete(`/api/v1/connections/${connA.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('should require authentication for all connection endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/connections').expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .send({ platform: 'github', connection_type: 'api' })
      .expect(401);
  });
});
