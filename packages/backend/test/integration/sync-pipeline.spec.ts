import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import type { PlatformConnector } from '@omniclip/shared';

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
import { SyncProcessor } from '../../src/sync/sync.processor';
import { ConnectorRegistry } from '../../src/connectors/connector.registry';

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

async function createConnection(
  token: string,
  platform: string,
  authData: Record<string, unknown> = { token: 'fake-token' }
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/connections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      platform,
      connection_type: 'api',
      auth_data: authData,
    })
    .expect(201);

  return res.body.id;
}

function createMockConnector(platform: string, mockItems: any[]): PlatformConnector {
  return {
    platform: platform as any,
    type: 'api',
    async healthCheck() {
      return { status: 'healthy', message: `Mock ${platform} healthy` };
    },
    async fetchContent() {
      return { items: mockItems, has_more: false };
    },
    parseResponse() {
      return [];
    },
  };
}

// ── Setup ──

beforeAll(async () => {
  const dbResult = await startTestDatabase();
  connectionString = dbResult.connectionString;
  testPool = dbResult.pool;

  // Set encryption key for test
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-ok!';

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

describe('Sync Pipeline Integration Tests', () => {
  it('should sync GitHub content via the processor and appear in the feed (T034)', async () => {
    const { token, userId } = await registerUser();
    
    // 1. Mock GitHub connector
    const registry = app.get(ConnectorRegistry);
    const mockItems = [
      {
        external_id: 'gh-1',
        content_type: 'release',
        title: 'Release v1.0.0',
        body: 'Description for gh-1',
        original_url: 'https://github.com/repo/1',
        published_at: new Date(),
        metadata: { stars: 100 },
      },
      {
        external_id: 'gh-2',
        content_type: 'release',
        title: 'Release v1.1.0',
        body: 'Description for gh-2',
        original_url: 'https://github.com/repo/2',
        published_at: new Date(),
        metadata: { stars: 150 },
      },
      {
        external_id: 'gh-3',
        content_type: 'release',
        title: 'Release v2.0.0',
        body: 'Description for gh-3',
        original_url: 'https://github.com/repo/3',
        published_at: new Date(),
        metadata: { stars: 500 },
      },
    ];
    registry.register(createMockConnector('github', mockItems));

    // 2. Create GitHub connection
    const connectionId = await createConnection(token, 'github', { personal_access_token: 'ghp_test' });

    // 3. Call sync processor directly
    const processor = app.get(SyncProcessor);
    const mockJob = {
      id: 'test-job-github',
      data: { connectionId, userId, platform: 'github' },
    } as any;
    await processor.process(mockJob);

    // 4. Verify items appear in feed
    const res = await request(app.getHttpServer())
      .get('/api/v1/content?platform=github')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].platform).toBe('github');
    expect(res.body.items[0].content_type).toBe('release');
    expect(res.body.items[0].metadata.stars).toBeDefined();

    // 5. Verify last_sync_at updated
    const connRes = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(connRes.body.last_sync_at).not.toBeNull();
  }, 30_000);

  it('should sync Twitter content via the processor and appear in the feed (T035)', async () => {
    const { token, userId } = await registerUser();

    // 1. Mock Twitter connector
    const registry = app.get(ConnectorRegistry);
    const mockItems = [
      {
        external_id: 'tw-1',
        content_type: 'tweet',
        title: 'Tweet 1',
        body: 'Content of tweet 1',
        original_url: 'https://twitter.com/user/1',
        published_at: new Date(),
        metadata: { likeCount: 50, retweetCount: 10 },
      },
      {
        external_id: 'tw-2',
        content_type: 'tweet',
        title: 'Tweet 2',
        body: 'Content of tweet 2',
        original_url: 'https://twitter.com/user/2',
        published_at: new Date(),
        metadata: { likeCount: 100, retweetCount: 20 },
      },
      {
        external_id: 'tw-3',
        content_type: 'tweet',
        title: 'Tweet 3',
        body: 'Content of tweet 3',
        original_url: 'https://twitter.com/user/3',
        published_at: new Date(),
        metadata: { likeCount: 500, retweetCount: 100 },
      },
    ];
    registry.register(createMockConnector('twitter', mockItems));

    // 2. Create Twitter connection
    const connectionId = await createConnection(token, 'twitter', { api_key: 'test-api-key' });

    // 3. Call sync processor
    const processor = app.get(SyncProcessor);
    const mockJob = {
      id: 'test-job-twitter',
      data: { connectionId, userId, platform: 'twitter' },
    } as any;
    await processor.process(mockJob);

    // 4. Verify items appear in feed
    const res = await request(app.getHttpServer())
      .get('/api/v1/content?platform=twitter')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].platform).toBe('twitter');
    expect(res.body.items[0].content_type).toBe('tweet');
  }, 30_000);

  it('should sync YouTube content via the processor and appear in the feed (T036)', async () => {
    const { token, userId } = await registerUser();

    // 1. Mock YouTube connector
    const registry = app.get(ConnectorRegistry);
    const mockItems = [
      {
        external_id: 'yt-1',
        content_type: 'video',
        title: 'Video 1',
        body: 'Description 1',
        original_url: 'https://youtube.com/watch?v=1',
        published_at: new Date(),
        metadata: { view_count: 1000, duration_seconds: 600 },
      },
      {
        external_id: 'yt-2',
        content_type: 'video',
        title: 'Video 2',
        body: 'Description 2',
        original_url: 'https://youtube.com/watch?v=2',
        published_at: new Date(),
        metadata: { view_count: 2000, duration_seconds: 1200 },
      },
      {
        external_id: 'yt-3',
        content_type: 'video',
        title: 'Video 3',
        body: 'Description 3',
        original_url: 'https://youtube.com/watch?v=3',
        published_at: new Date(),
        metadata: { view_count: 5000, duration_seconds: 1800 },
      },
    ];
    registry.register(createMockConnector('youtube', mockItems));

    // 2. Create YouTube connection
    const connectionId = await createConnection(token, 'youtube', { access_token: 'abc', refresh_token: 'def' });

    // 3. Call sync processor
    const processor = app.get(SyncProcessor);
    const mockJob = {
      id: 'test-job-youtube',
      data: { connectionId, userId, platform: 'youtube' },
    } as any;
    await processor.process(mockJob);

    // 4. Verify items appear in feed
    const res = await request(app.getHttpServer())
      .get('/api/v1/content?platform=youtube')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].platform).toBe('youtube');
    expect(res.body.items[0].content_type).toBe('video');
  }, 30_000);

  it('should generate AI digest with content from all 3 platforms (T037)', async () => {
    const { token, userId } = await registerUser();
    const registry = app.get(ConnectorRegistry);
    const processor = app.get(SyncProcessor);

    // 1. Sync all 3 platforms
    const platforms = ['github', 'twitter', 'youtube'];
    for (const platform of platforms) {
      const mockItems = Array.from({ length: 3 }, (_, i) => ({
        external_id: `${platform}-${i}`,
        content_type: platform === 'github' ? 'release' : platform === 'twitter' ? 'tweet' : 'video',
        title: `${platform} content ${i}`,
        body: `Body of ${platform} ${i}`,
        original_url: `https://${platform}.com/${i}`,
        published_at: new Date(),
        metadata: {},
      }));
      registry.register(createMockConnector(platform, mockItems));
      
      const connectionId = await createConnection(token, platform);
      const mockJob = {
        id: `job-${platform}`,
        data: { connectionId, userId, platform },
      } as any;
      await processor.process(mockJob);
    }

    // 2. Trigger digest generation
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const genRes = await request(app.getHttpServer())
      .post('/api/v1/digests/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        digest_type: 'daily',
        period_start: yesterday.toISOString(),
        period_end: now.toISOString(),
      })
      .expect(202);

    // 3. Verify digest results
    const digestRes = await request(app.getHttpServer())
      .get(`/api/v1/digests/${genRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(digestRes.body.status).toBe('completed');
    expect(digestRes.body.item_count).toBe(9);
    expect(digestRes.body.topic_groups).toBeDefined();
    expect(digestRes.body.topic_groups.length).toBeGreaterThan(0);
  }, 30_000);
});
