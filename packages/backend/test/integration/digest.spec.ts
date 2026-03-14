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
import { DigestService } from '../../src/digest/digest.service';

let app: INestApplication;
let testPool: Pool;
let connectionString: string;

// ── Helpers ──

async function registerUser(
  email = `test-${randomUUID()}@example.com`,
  password = 'TestPass123!',
  displayName = 'Test User',
): Promise<{ token: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, display_name: displayName })
    .expect(201);

  return {
    token: res.body.access_token,
    userId: res.body.user.id,
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

async function insertContentItems(
  token: string,
  connectionId: string,
  platform: string,
  count: number,
  daysAgo = 0,
): Promise<string[]> {
  // Use the ContentService directly to insert items
  const { ContentService } = await import('../../src/content/content.service');
  const svc = app.get(ContentService);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - daysAgo);

  const items = Array.from({ length: count }, (_, i) => ({
    connectionId,
    platform,
    externalId: `ext-${randomUUID()}`,
    contentType: i % 3 === 0 ? 'release' : i % 3 === 1 ? 'video' : 'post',
    title: `Content Item ${i + 1}: ${platform} update`,
    body: `This is the body of content item ${i + 1}. It contains interesting information about ${platform} and technology trends.`,
    originalUrl: `https://${platform}.com/item/${i}`,
    publishedAt: new Date(baseDate.getTime() - (count - i) * 60000), // items in the past, 1 min apart
    authorName: `author-${i}`,
    authorUrl: `https://${platform}.com/user/author-${i}`,
    mediaUrls: [],
    metadata: {
      likes: Math.floor(Math.random() * 1000),
      view_count: Math.floor(Math.random() * 50000),
    },
  }));

  // Get userId from token
  const userRes = await request(app.getHttpServer())
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const userId = userRes.body.id;

  await svc.upsertMany(userId, items);

  // Fetch inserted items to get their IDs
  const feedRes = await request(app.getHttpServer())
    .get(`/api/v1/content?limit=${count}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  return feedRes.body.items.map((item: any) => item.id);
}

// ── Setup ──

beforeAll(async () => {
  const dbResult = await startTestDatabase();
  connectionString = dbResult.connectionString;
  testPool = dbResult.pool;

  app = await createTestApp(
    [
      DatabaseModule,
      AuthModule,
      UsersModule,
      ConnectorsModule,
      ConnectionsModule,
      ContentModule,
      SyncModule,
      DigestModule,
    ],
    connectionString,
  );
}, 60_000);

afterAll(async () => {
  if (app) await app.close();
  await stopTestDatabase();
});

beforeEach(async () => {
  await truncateAllTables(testPool);
});

// ── Tests ──

describe('Digest Integration Tests', () => {
  // ── POST /digests/generate ──

  describe('POST /digests/generate', () => {
    it('should generate a digest with 20+ content items (map-reduce pipeline)', async () => {
      const { token, userId } = await registerUser();
      const connectionId = await createConnection(token, 'github');
      await insertContentItems(token, connectionId, 'github', 15, 0);

      // Also insert items from another platform
      const ytConnectionId = await createConnection(token, 'youtube');
      await insertContentItems(token, ytConnectionId, 'youtube', 10, 0);

      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 1);

      const res = await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: periodStart.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('pending');
      expect(res.body.message).toBe('Digest generation queued');

      // Verify the digest was created and completed (stub mode)
      const digestRes = await request(app.getHttpServer())
        .get(`/api/v1/digests/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(digestRes.body.status).toBe('completed');
      expect(digestRes.body.item_count).toBe(25);
      expect(digestRes.body.topic_groups).toBeDefined();
      expect(Array.isArray(digestRes.body.topic_groups)).toBe(true);
      expect(digestRes.body.topic_groups.length).toBeGreaterThan(0);
      expect(digestRes.body.trend_analysis).toBeDefined();
      expect(digestRes.body.digest_type).toBe('daily');
    }, 30_000);

    it('should generate individual summaries for <5 items', async () => {
      const { token } = await registerUser();
      const connectionId = await createConnection(token, 'github');
      await insertContentItems(token, connectionId, 'github', 3, 0);

      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 1);

      const res = await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: periodStart.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      const digestRes = await request(app.getHttpServer())
        .get(`/api/v1/digests/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(digestRes.body.status).toBe('completed');
      expect(digestRes.body.item_count).toBe(3);
      expect(digestRes.body.topic_groups).toBeDefined();
    });

    it('should handle empty content period gracefully', async () => {
      const { token } = await registerUser();

      // No content inserted — generate for a period with no items
      const now = new Date();
      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 1);

      const res = await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: periodStart.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      const digestRes = await request(app.getHttpServer())
        .get(`/api/v1/digests/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(digestRes.body.status).toBe('completed');
      expect(digestRes.body.item_count).toBe(0);
      expect(digestRes.body.topic_groups).toEqual([]);
    });

    it('should validate request body', async () => {
      const { token } = await registerUser();

      // Missing required fields
      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      // Invalid digest_type
      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'monthly',
          period_start: new Date().toISOString(),
          period_end: new Date().toISOString(),
        })
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .send({
          digest_type: 'daily',
          period_start: new Date().toISOString(),
          period_end: new Date().toISOString(),
        })
        .expect(401);
    });
  });

  // ── GET /digests ──

  describe('GET /digests', () => {
    it('should list digests with pagination', async () => {
      const { token } = await registerUser();
      const connectionId = await createConnection(token);
      await insertContentItems(token, connectionId, 'github', 5, 0);

      // Generate two digests
      const now = new Date();
      const dayAgo = new Date(now);
      dayAgo.setDate(dayAgo.getDate() - 1);

      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: dayAgo.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      const twoDaysAgo = new Date(now);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'weekly',
          period_start: twoDaysAgo.toISOString(),
          period_end: dayAgo.toISOString(),
        })
        .expect(202);

      // List all
      const res = await request(app.getHttpServer())
        .get('/api/v1/digests')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.digests).toHaveLength(2);
      expect(res.body.pagination).toHaveProperty('total', 2);
      expect(res.body.pagination).toHaveProperty('page', 1);
    });

    it('should filter by type', async () => {
      const { token } = await registerUser();
      const connectionId = await createConnection(token);
      await insertContentItems(token, connectionId, 'github', 5, 0);

      const now = new Date();
      const dayAgo = new Date(now);
      dayAgo.setDate(dayAgo.getDate() - 1);

      // Generate daily
      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: dayAgo.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      // Generate weekly
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);

      await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'weekly',
          period_start: weekAgo.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      // Filter by daily
      const res = await request(app.getHttpServer())
        .get('/api/v1/digests?type=daily')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.digests).toHaveLength(1);
      expect(res.body.digests[0].digest_type).toBe('daily');
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/digests').expect(401);
    });
  });

  // ── GET /digests/:id ──

  describe('GET /digests/:id', () => {
    it('should return a single digest with full content', async () => {
      const { token } = await registerUser();
      const connectionId = await createConnection(token);
      await insertContentItems(token, connectionId, 'github', 10, 0);

      const now = new Date();
      const dayAgo = new Date(now);
      dayAgo.setDate(dayAgo.getDate() - 1);

      const genRes = await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: dayAgo.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/digests/${genRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe(genRes.body.id);
      expect(res.body.digest_type).toBe('daily');
      expect(res.body.status).toBe('completed');
      expect(res.body.topic_groups).toBeDefined();
      expect(res.body.item_count).toBe(10);
      expect(res.body.period_start).toBeDefined();
      expect(res.body.period_end).toBeDefined();
    });

    it('should return 404 for non-existent digest', async () => {
      const { token } = await registerUser();

      await request(app.getHttpServer())
        .get(`/api/v1/digests/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ── RLS isolation ──

  describe('RLS isolation', () => {
    it('should not allow user A to see user B digests', async () => {
      const userA = await registerUser();
      const userB = await registerUser();

      const connA = await createConnection(userA.token, 'github');
      await insertContentItems(userA.token, connA, 'github', 5, 0);

      const now = new Date();
      const dayAgo = new Date(now);
      dayAgo.setDate(dayAgo.getDate() - 1);

      // User A generates a digest
      const genRes = await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          digest_type: 'daily',
          period_start: dayAgo.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      // User B should not see User A's digest
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/digests')
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(200);

      expect(listRes.body.digests).toHaveLength(0);

      // User B should get 404 for User A's digest ID
      await request(app.getHttpServer())
        .get(`/api/v1/digests/${genRes.body.id}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .expect(404);
    });
  });

  // ── GET /digests/:id/stream (SSE) ──

  describe('GET /digests/:id/stream', () => {
    it('should return SSE complete event for completed digest', async () => {
      const { token } = await registerUser();
      const connectionId = await createConnection(token);
      await insertContentItems(token, connectionId, 'github', 5, 0);

      const now = new Date();
      const dayAgo = new Date(now);
      dayAgo.setDate(dayAgo.getDate() - 1);

      const genRes = await request(app.getHttpServer())
        .post('/api/v1/digests/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          digest_type: 'daily',
          period_start: dayAgo.toISOString(),
          period_end: now.toISOString(),
        })
        .expect(202);

      // Stream should return complete event since generation already finished
      const streamRes = await request(app.getHttpServer())
        .get(`/api/v1/digests/${genRes.body.id}/stream`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(streamRes.headers['content-type']).toContain('text/event-stream');
      expect(streamRes.text).toContain('event: complete');
      expect(streamRes.text).toContain('completed');
    });

    it('should return 404 for non-existent digest stream', async () => {
      const { token } = await registerUser();

      await request(app.getHttpServer())
        .get(`/api/v1/digests/${randomUUID()}/stream`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
