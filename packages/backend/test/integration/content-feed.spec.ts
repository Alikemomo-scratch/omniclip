/**
 * T021: Integration test for content feed
 * Tests: paginated feed query, platform filter, date range filter, search.
 *        Verify chronological sort. Verify deduplication (upsert).
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
import { ContentModule } from '../../src/content/content.module';
import { ContentService } from '../../src/content/content.service';
import {
  startTestDatabase,
  createTestApp,
  truncateAllTables,
  stopTestDatabase,
} from '../helpers/test-db';

describe('Content Feed (Integration)', () => {
  let app: INestApplication;
  let connectionString: string;
  let testPool: Pool;
  let contentService: ContentService;

  // Helper: register user + create connection, return { token, userId, connectionId }
  async function setupUserWithConnection(email: string, name: string, platform = 'github') {
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', display_name: name });
    const token = regRes.body.access_token;
    const userId = regRes.body.user.id;

    const connRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform, connection_type: 'api' });

    return { token, userId, connectionId: connRes.body.id };
  }

  beforeAll(async () => {
    const result = await startTestDatabase();
    connectionString = result.connectionString;
    testPool = result.pool;

    app = await createTestApp(
      [DatabaseModule, AuthModule, UsersModule, ConnectionsModule, ConnectorsModule, ContentModule],
      connectionString,
    );

    contentService = app.get(ContentService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(testPool);
  });

  it('should return empty feed for a new user', async () => {
    const { token } = await setupUserWithConnection('empty@example.com', 'Empty');

    const res = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(0);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 0,
      total_pages: 0,
    });
  });

  it('should return content items sorted by published_at DESC', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'sort@example.com',
      'Sort',
    );

    // Insert items with different dates
    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'old-item',
        contentType: 'release',
        title: 'Old Item',
        originalUrl: 'https://github.com/old',
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      },
      {
        connectionId,
        platform: 'github',
        externalId: 'new-item',
        contentType: 'release',
        title: 'New Item',
        originalUrl: 'https://github.com/new',
        publishedAt: new Date('2024-06-01T00:00:00Z'),
      },
      {
        connectionId,
        platform: 'github',
        externalId: 'mid-item',
        contentType: 'release',
        title: 'Mid Item',
        originalUrl: 'https://github.com/mid',
        publishedAt: new Date('2024-03-15T00:00:00Z'),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].title).toBe('New Item');
    expect(res.body.items[1].title).toBe('Mid Item');
    expect(res.body.items[2].title).toBe('Old Item');
  });

  it('should paginate correctly', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'page@example.com',
      'Page',
    );

    // Insert 5 items
    const items = Array.from({ length: 5 }, (_, i) => ({
      connectionId,
      platform: 'github',
      externalId: `item-${i}`,
      contentType: 'release',
      title: `Item ${i}`,
      originalUrl: `https://github.com/item-${i}`,
      publishedAt: new Date(`2024-0${i + 1}-01T00:00:00Z`),
    }));
    await contentService.upsertMany(userId, items);

    // Page 1 with limit 2
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/content?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 5,
      total_pages: 3,
    });

    // Page 2
    const page2 = await request(app.getHttpServer())
      .get('/api/v1/content?page=2&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page2.body.items).toHaveLength(2);
    // Items should not overlap
    const page1Ids = page1.body.items.map((i: { id: string }) => i.id);
    const page2Ids = page2.body.items.map((i: { id: string }) => i.id);
    expect(page1Ids).not.toEqual(expect.arrayContaining(page2Ids));

    // Page 3 — last page with 1 item
    const page3 = await request(app.getHttpServer())
      .get('/api/v1/content?page=3&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page3.body.items).toHaveLength(1);
  });

  it('should filter by platform', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'plat@example.com',
      'Plat',
    );

    // We need a second connection for a different platform
    const conn2 = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'twitter', connection_type: 'api' });

    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'gh-1',
        contentType: 'release',
        title: 'GH Item',
        originalUrl: 'https://github.com/gh',
        publishedAt: new Date('2024-01-01'),
      },
      {
        connectionId: conn2.body.id,
        platform: 'twitter',
        externalId: 'tw-1',
        contentType: 'tweet',
        title: 'Tweet',
        originalUrl: 'https://twitter.com/tw',
        publishedAt: new Date('2024-02-01'),
      },
    ]);

    const ghRes = await request(app.getHttpServer())
      .get('/api/v1/content?platform=github')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(ghRes.body.items).toHaveLength(1);
    expect(ghRes.body.items[0].platform).toBe('github');

    const twRes = await request(app.getHttpServer())
      .get('/api/v1/content?platform=twitter')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(twRes.body.items).toHaveLength(1);
    expect(twRes.body.items[0].platform).toBe('twitter');
  });

  it('should filter by date range', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'date@example.com',
      'Date',
    );

    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'jan',
        contentType: 'release',
        title: 'January',
        originalUrl: 'https://github.com/jan',
        publishedAt: new Date('2024-01-15'),
      },
      {
        connectionId,
        platform: 'github',
        externalId: 'mar',
        contentType: 'release',
        title: 'March',
        originalUrl: 'https://github.com/mar',
        publishedAt: new Date('2024-03-15'),
      },
      {
        connectionId,
        platform: 'github',
        externalId: 'jun',
        contentType: 'release',
        title: 'June',
        originalUrl: 'https://github.com/jun',
        publishedAt: new Date('2024-06-15'),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/content?from=2024-02-01&to=2024-04-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('March');
  });

  it('should search by title and body', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'search@example.com',
      'Search',
    );

    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'react-item',
        contentType: 'release',
        title: 'React v19 Release',
        body: 'New concurrent features',
        originalUrl: 'https://github.com/react',
        publishedAt: new Date('2024-01-01'),
      },
      {
        connectionId,
        platform: 'github',
        externalId: 'vue-item',
        contentType: 'release',
        title: 'Vue v4 Release',
        body: 'Performance improvements',
        originalUrl: 'https://github.com/vue',
        publishedAt: new Date('2024-02-01'),
      },
      {
        connectionId,
        platform: 'github',
        externalId: 'rust-item',
        contentType: 'release',
        title: 'Rust 2024 Edition',
        body: 'Concurrent programming updates',
        originalUrl: 'https://github.com/rust',
        publishedAt: new Date('2024-03-01'),
      },
    ]);

    // Search title
    const titleRes = await request(app.getHttpServer())
      .get('/api/v1/content?search=React')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(titleRes.body.items).toHaveLength(1);
    expect(titleRes.body.items[0].title).toBe('React v19 Release');

    // Search body
    const bodyRes = await request(app.getHttpServer())
      .get('/api/v1/content?search=concurrent')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bodyRes.body.items).toHaveLength(2); // React (body) + Rust (body)
  });

  it('should deduplicate via upsert (ON CONFLICT DO UPDATE)', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'dedup@example.com',
      'Dedup',
    );

    // First insert
    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'same-id',
        contentType: 'release',
        title: 'Original Title',
        body: 'Original body',
        originalUrl: 'https://github.com/orig',
        publishedAt: new Date('2024-01-01'),
      },
    ]);

    // Upsert with same externalId but different title
    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'same-id',
        contentType: 'release',
        title: 'Updated Title',
        body: 'Updated body',
        originalUrl: 'https://github.com/updated',
        publishedAt: new Date('2024-01-01'),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Should only have 1 item (not 2)
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('Updated Title');
    expect(res.body.items[0].body).toBe('Updated body');
    expect(res.body.items[0].original_url).toBe('https://github.com/updated');
  });

  it('should isolate content between users (RLS)', async () => {
    const userA = await setupUserWithConnection('contenta@example.com', 'ContentA');
    const userB = await setupUserWithConnection('contentb@example.com', 'ContentB');

    await contentService.upsertMany(userA.userId, [
      {
        connectionId: userA.connectionId,
        platform: 'github',
        externalId: 'a-item',
        contentType: 'release',
        title: 'User A Item',
        originalUrl: 'https://github.com/a',
        publishedAt: new Date('2024-01-01'),
      },
    ]);

    await contentService.upsertMany(userB.userId, [
      {
        connectionId: userB.connectionId,
        platform: 'github',
        externalId: 'b-item',
        contentType: 'release',
        title: 'User B Item',
        originalUrl: 'https://github.com/b',
        publishedAt: new Date('2024-01-01'),
      },
    ]);

    // User A should only see their content
    const resA = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);
    expect(resA.body.items).toHaveLength(1);
    expect(resA.body.items[0].title).toBe('User A Item');

    // User B should only see their content
    const resB = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(200);
    expect(resB.body.items).toHaveLength(1);
    expect(resB.body.items[0].title).toBe('User B Item');
  });

  it('should get content item by ID', async () => {
    const { token, userId, connectionId } = await setupUserWithConnection(
      'byid@example.com',
      'ById',
    );

    await contentService.upsertMany(userId, [
      {
        connectionId,
        platform: 'github',
        externalId: 'get-by-id',
        contentType: 'release',
        title: 'Get By ID',
        originalUrl: 'https://github.com/byid',
        publishedAt: new Date('2024-01-01'),
      },
    ]);

    // Get the ID from the list
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const itemId = listRes.body.items[0].id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/content/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.title).toBe('Get By ID');
    expect(res.body.id).toBe(itemId);
  });

  it('should return 404 for non-existent content item', async () => {
    const { token } = await setupUserWithConnection('notfound@example.com', 'NotFound');

    await request(app.getHttpServer())
      .get('/api/v1/content/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('should require authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/content').expect(401);
  });
});
