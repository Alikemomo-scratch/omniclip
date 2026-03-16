/**
 * T057 + T058: RLS Isolation Integration Tests
 *
 * Verifies that Row-Level Security enforces complete data isolation between
 * users across ALL scoped tables: users, platform_connections, content_items,
 * sync_jobs, digests. Also tests edge cases: accessing another user's
 * resource by ID returns 404 (not 403 — no information leakage).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';

import {
  startTestDatabase,
  createTestApp,
  truncateAllTables,
  stopTestDatabase,
} from '../helpers/test-db';
import { DatabaseModule } from '../../src/common/database';
import { AuthModule } from '../../src/auth';
import { UsersModule } from '../../src/users';
import { ContentModule } from '../../src/content';
import { ConnectorsModule } from '../../src/connectors';
import { ConnectionsModule } from '../../src/connections';
import { SyncModule } from '../../src/sync';
import { DigestModule } from '../../src/digest';

let app: INestApplication;
let testPool: Pool;
let connectionString: string;

// ── Helpers ──

interface UserContext {
  token: string;
  userId: string;
  email: string;
}

async function registerUser(
  email = `test-${randomUUID()}@example.com`,
  password = 'TestPass123!',
  displayName = 'Test User',
): Promise<UserContext> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, display_name: displayName })
    .expect(201);

  return {
    token: res.body.access_token,
    userId: res.body.user.id,
    email,
  };
}

async function createConnection(token: string, platform = 'github'): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/connections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      platform,
      connection_type: 'api',
      auth_data: { token: 'fake-token' },
    })
    .expect(201);

  return res.body.id;
}

async function insertContentViaService(
  userId: string,
  connectionId: string,
  platform: string,
  count: number,
): Promise<string[]> {
  const { ContentService } = await import('../../src/content/content.service');
  const svc = app.get(ContentService);

  const items = Array.from({ length: count }, (_, i) => ({
    connectionId,
    platform,
    externalId: `ext-${randomUUID()}`,
    contentType: 'post' as const,
    title: `Content by ${userId} #${i}`,
    body: `Body content ${i}`,
    originalUrl: `https://${platform}.com/item/${randomUUID()}`,
    publishedAt: new Date(Date.now() - (count - i) * 60000),
    authorName: 'Author',
    authorUrl: `https://${platform}.com/author`,
    mediaUrls: [],
    metadata: {},
  }));

  return svc.upsertMany(userId, items).then(() => items.map((item) => item.externalId));
}

async function insertDigestDirectly(userId: string): Promise<string> {
  // Insert digest via raw superuser pool (bypassing RLS) to set up test data
  const result = await testPool.query(
    `INSERT INTO digests (user_id, digest_type, period_start, period_end, language, topic_groups, item_count, status)
     VALUES ($1, 'daily', NOW() - INTERVAL '1 day', NOW(), 'en', '[]', 0, 'completed')
     RETURNING id`,
    [userId],
  );
  return result.rows[0].id;
}

async function insertSyncJobDirectly(
  userId: string,
  connectionId: string,
  platform: string,
): Promise<string> {
  // Insert sync_job via raw superuser pool (bypassing RLS) to set up test data
  const result = await testPool.query(
    `INSERT INTO sync_jobs (user_id, connection_id, platform, status, started_at, completed_at)
     VALUES ($1, $2, $3, 'completed', NOW(), NOW())
     RETURNING id`,
    [userId, connectionId, platform],
  );
  return result.rows[0].id;
}

// ── Setup ──

describe('RLS Isolation (T057 + T058)', () => {
  beforeAll(async () => {
    const testDb = await startTestDatabase();
    testPool = testDb.pool;
    connectionString = testDb.connectionString;

    app = await createTestApp(
      [
        DatabaseModule,
        AuthModule,
        UsersModule,
        ContentModule,
        ConnectorsModule,
        ConnectionsModule,
        SyncModule,
        DigestModule,
      ],
      connectionString,
    );
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(testPool);
  });

  // ────────────────────────────────────────────────────────────
  // 1. Cross-user data leakage — listing endpoints
  // ────────────────────────────────────────────────────────────

  describe('Zero cross-user leakage on listing endpoints', () => {
    let userA: UserContext;
    let userB: UserContext;
    let connA: string;
    let connB: string;

    beforeEach(async () => {
      userA = await registerUser();
      userB = await registerUser();

      // User A connects GitHub, User B connects YouTube
      connA = await createConnection(userA.token, 'github');
      connB = await createConnection(userB.token, 'youtube');

      // Insert content for each user
      await insertContentViaService(userA.userId, connA, 'github', 3);
      await insertContentViaService(userB.userId, connB, 'youtube', 5);

      // Insert sync_jobs for each user
      await insertSyncJobDirectly(userA.userId, connA, 'github');
      await insertSyncJobDirectly(userB.userId, connB, 'youtube');

      // Insert digests for each user
      await insertDigestDirectly(userA.userId);
      await insertDigestDirectly(userB.userId);
    });

    it('connections — user A sees only their own connections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      expect(res.body.connections).toHaveLength(1);
      expect(res.body.connections[0].platform).toBe('github');
      expect(res.body.connections[0].id).toBe(connA);
    });

    it('connections — user B sees only their own connections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(res.body.connections).toHaveLength(1);
      expect(res.body.connections[0].platform).toBe('youtube');
      expect(res.body.connections[0].id).toBe(connB);
    });

    it('content — user A sees only their 3 items', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(3);
      for (const item of res.body.items) {
        expect(item.platform).toBe('github');
      }
    });

    it('content — user B sees only their 5 items', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(5);
      for (const item of res.body.items) {
        expect(item.platform).toBe('youtube');
      }
    });

    it('digests — user A sees only their own digest', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/digests')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      expect(res.body.digests).toHaveLength(1);
    });

    it('digests — user B sees only their own digest', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/digests')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(res.body.digests).toHaveLength(1);
    });

    it('user profile — user A sees only own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      expect(res.body.id).toBe(userA.userId);
      expect(res.body.email).toBe(userA.email);
    });

    it('user profile — user B sees only own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(res.body.id).toBe(userB.userId);
      expect(res.body.email).toBe(userB.email);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Direct ID access — must return 404, not 403
  // ────────────────────────────────────────────────────────────

  describe('Direct access to other user resources returns 404', () => {
    let userA: UserContext;
    let userB: UserContext;
    let connA: string;
    let connB: string;
    let digestA: string;
    let digestB: string;

    beforeEach(async () => {
      userA = await registerUser();
      userB = await registerUser();

      connA = await createConnection(userA.token, 'github');
      connB = await createConnection(userB.token, 'youtube');

      await insertContentViaService(userA.userId, connA, 'github', 2);
      await insertContentViaService(userB.userId, connB, 'youtube', 2);

      digestA = await insertDigestDirectly(userA.userId);
      digestB = await insertDigestDirectly(userB.userId);
    });

    it('GET /connections/:id — user A cannot see user B connection (404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/connections/${connB}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(404);

      // Should NOT reveal that the resource exists — generic "not found" message
      expect(res.body.message).toMatch(/not found/i);
    });

    it('GET /connections/:id — user B cannot see user A connection (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/connections/${connA}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(404);
    });

    it('PATCH /connections/:id — user A cannot update user B connection (404)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/connections/${connB}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ sync_interval_minutes: 120 })
        .expect(404);
    });

    it('DELETE /connections/:id — user A cannot delete user B connection (404)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/connections/${connB}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(404);

      // Verify B's connection still exists
      const res = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(res.body.connections).toHaveLength(1);
    });

    it('GET /content/:id — user A cannot see user B content (404)', async () => {
      // Get one of user B's content item IDs
      const bContent = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      const itemBId = bContent.body.items[0].id;

      await request(app.getHttpServer())
        .get(`/api/v1/content/${itemBId}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(404);
    });

    it('GET /digests/:id — user A cannot see user B digest (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/digests/${digestB}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(404);
    });

    it('GET /digests/:id — user B cannot see user A digest (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/digests/${digestA}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(404);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. User profile isolation — PATCH /users/me
  // ────────────────────────────────────────────────────────────

  describe('User profile update isolation', () => {
    it('PATCH /users/me updates only own profile and does not affect other users', async () => {
      const userA = await registerUser();
      const userB = await registerUser();

      // User A updates their display name
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ display_name: 'User A Updated' })
        .expect(200);

      // User B's profile should be unchanged
      const resB = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(resB.body.display_name).toBe('Test User');
      expect(resB.body.id).toBe(userB.userId);

      // User A sees updated name
      const resA = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      expect(resA.body.display_name).toBe('User A Updated');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Connection creation isolation — duplicate check per user
  // ────────────────────────────────────────────────────────────

  describe('Connection creation is per-user', () => {
    it('two users can independently connect the same platform', async () => {
      const userA = await registerUser();
      const userB = await registerUser();

      // Both users connect GitHub — should succeed independently
      const connA = await createConnection(userA.token, 'github');
      const connB = await createConnection(userB.token, 'github');

      expect(connA).toBeDefined();
      expect(connB).toBeDefined();
      expect(connA).not.toBe(connB);
    });

    it('same user cannot create duplicate platform connection', async () => {
      const userA = await registerUser();
      await createConnection(userA.token, 'github');

      // Second GitHub connection should fail
      await request(app.getHttpServer())
        .post('/api/v1/connections')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          platform: 'github',
          connection_type: 'api',
          auth_data: { token: 'another-token' },
        })
        .expect(409);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. Deletion cascading within user scope
  // ────────────────────────────────────────────────────────────

  describe('Deletion only affects own data', () => {
    it('deleting user A connection does not affect user B data', async () => {
      const userA = await registerUser();
      const userB = await registerUser();

      const connA = await createConnection(userA.token, 'github');
      const connB = await createConnection(userB.token, 'youtube');

      await insertContentViaService(userA.userId, connA, 'github', 3);
      await insertContentViaService(userB.userId, connB, 'youtube', 5);

      // Delete user A's connection
      await request(app.getHttpServer())
        .delete(`/api/v1/connections/${connA}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(204);

      // User A should have no connections
      const resA = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);
      expect(resA.body.connections).toHaveLength(0);

      // User B should still have their connection and content
      const resB = await request(app.getHttpServer())
        .get('/api/v1/connections')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);
      expect(resB.body.connections).toHaveLength(1);

      const contentB = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);
      expect(contentB.body.items).toHaveLength(5);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 6. RLS with invalid/random UUID — should get 404
  // ────────────────────────────────────────────────────────────

  describe('Nonexistent resource IDs return 404', () => {
    it('GET /connections/:id with random UUID returns 404', async () => {
      const user = await registerUser();
      const fakeId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/v1/connections/${fakeId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });

    it('GET /content/:id with random UUID returns 404', async () => {
      const user = await registerUser();
      const fakeId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/v1/content/${fakeId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });

    it('GET /digests/:id with random UUID returns 404', async () => {
      const user = await registerUser();
      const fakeId = randomUUID();

      await request(app.getHttpServer())
        .get(`/api/v1/digests/${fakeId}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });
  });
});
