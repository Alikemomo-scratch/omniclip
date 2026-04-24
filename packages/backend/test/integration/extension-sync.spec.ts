/**
 * T034: Integration test for extension sync endpoint
 * Tests: POST /api/v1/sync/extension per extension-sync.md.
 * Verify batch upsert, partial success (207), auth validation.
 * Uses Testcontainers (PostgreSQL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
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

describe('Extension Sync Endpoint (Integration)', () => {
  let app: INestApplication;
  let connectionString: string;
  let testPool: Pool;

  /**
   * Helper: register user, create an extension-type connection for a platform.
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

  /**
   * Build a valid sync payload.
   */
  function buildSyncPayload(
    platform: string,
    connectionId: string,
    items: Array<Record<string, unknown>>,
  ) {
    return {
      platform,
      connection_id: connectionId,
      items,
      sync_metadata: {
        collected_at: new Date().toISOString(),
        items_in_buffer: items.length,
        extension_version: '1.0.0',
      },
    };
  }

  /**
   * Build a sample Twitter content item.
   */
  function buildItem(id: string, overrides: Record<string, unknown> = {}) {
    return {
      external_id: `tweet-${id}`,
      content_type: 'tweet',
      title: `Test Tweet ${id}`,
      body: `Body of tweet ${id}`,
      media_urls: [`https://example.com/img-${id}.jpg`],
      metadata: { likes: 100, retweets: 50 },
      author_name: `Author ${id}`,
      author_url: `https://twitter.com/user/${id}`,
      original_url: `https://twitter.com/user/status/${id}`,
      published_at: new Date().toISOString(),
      ...overrides,
    };
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

  it('should reject unauthenticated requests with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .send({
        platform: 'twitter',
        connection_id: randomUUID(),
        items: [buildItem('1')],
      });

    expect(res.status).toBe(401);
  });

  it('should reject requests with invalid connection_id (not owned by user)', async () => {
    const { token } = await setupUserWithExtensionConnection('user1@ext.com', 'User1');

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(buildSyncPayload('twitter', randomUUID(), [buildItem('1')]));

    expect(res.status).toBe(404);
  });

  // ── Successful Sync ──

  it('should accept a batch of valid items and return 200', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection(
      'user3@ext.com',
      'User3',
    );

    const items = [buildItem('a'), buildItem('b'), buildItem('c')];

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(buildSyncPayload('twitter', connectionId, items));

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(3);
    expect(res.body.errors).toHaveLength(0);
  });

  it('should deduplicate items on subsequent syncs (upsert)', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection(
      'user4@ext.com',
      'User4',
    );

    // First sync
    const items = [buildItem('dup1'), buildItem('dup2')];
    await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(buildSyncPayload('twitter', connectionId, items))
      .expect(200);

    // Second sync with same external_ids but updated content
    const updatedItems = [
      buildItem('dup1', { title: 'Updated Title 1' }),
      buildItem('dup2', { title: 'Updated Title 2' }),
      buildItem('dup3'),
    ];

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(buildSyncPayload('twitter', connectionId, updatedItems))
      .expect(200);

    expect(res.body.accepted).toBe(3); // All 3 processed (2 updated + 1 new)

    // Verify the feed has exactly 3 items (not 5)
    const feedRes = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(feedRes.body.items).toHaveLength(3);

    // Verify updated titles
    const titles = feedRes.body.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('Updated Title 1');
    expect(titles).toContain('Updated Title 2');
  });

  it('should store items in feed accessible via GET /content', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection(
      'user5@ext.com',
      'User5',
    );

    await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(
        buildSyncPayload('twitter', connectionId, [
          buildItem('feed1', {
            title: 'Feed Test Tweet',
            author_name: 'Twitter Creator',
          }),
        ]),
      )
      .expect(200);

    const feedRes = await request(app.getHttpServer())
      .get('/api/v1/content?platform=twitter')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(feedRes.body.items).toHaveLength(1);
    expect(feedRes.body.items[0].title).toBe('Feed Test Tweet');
    expect(feedRes.body.items[0].author_name).toBe('Twitter Creator');
    expect(feedRes.body.items[0].platform).toBe('twitter');
  });

  // ── Partial Success (207) ──

  it('should return 207 when some items have validation errors', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection(
      'user6@ext.com',
      'User6',
    );

    const items = [
      buildItem('valid1'),
      // Invalid item: missing original_url
      {
        external_id: 'tweet-invalid1',
        content_type: 'tweet',
        title: 'Bad Item',
        body: 'No URL',
        original_url: '', // empty = falsy
      },
    ];

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(buildSyncPayload('twitter', connectionId, items));

    expect(res.status).toBe(207);
    expect(res.body.accepted).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].external_id).toBe('tweet-invalid1');
    expect(res.body.errors[0].error).toBe('validation_failed');
  });

  // ── RLS Isolation ──

  it('should isolate content between users (user A cannot see user B content)', async () => {
    const userA = await setupUserWithExtensionConnection('userA@ext.com', 'UserA');
    const userB = await setupUserWithExtensionConnection('userB@ext.com', 'UserB');

    // User A syncs content
    await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${userA.token}`)
      .send(
        buildSyncPayload('twitter', userA.connectionId, [
          buildItem('a-private', { title: 'Private to A' }),
        ]),
      )
      .expect(200);

    // User B syncs content
    await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${userB.token}`)
      .send(
        buildSyncPayload('twitter', userB.connectionId, [
          buildItem('b-private', { title: 'Private to B' }),
        ]),
      )
      .expect(200);

    // User A should only see their content
    const feedA = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(feedA.body.items).toHaveLength(1);
    expect(feedA.body.items[0].title).toBe('Private to A');

    // User B should only see their content
    const feedB = await request(app.getHttpServer())
      .get('/api/v1/content')
      .set('Authorization', `Bearer ${userB.token}`)
      .expect(200);

    expect(feedB.body.items).toHaveLength(1);
    expect(feedB.body.items[0].title).toBe('Private to B');
  });

  // ── User A cannot sync to User B's connection ──

  it('should prevent user from syncing to another user connection', async () => {
    const userA = await setupUserWithExtensionConnection('crossA@ext.com', 'CrossA');
    const userB = await setupUserWithExtensionConnection('crossB@ext.com', 'CrossB');

    // User A tries to sync to User B's connection
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${userA.token}`)
      .send(buildSyncPayload('twitter', userB.connectionId, [buildItem('cross-test')]));

    // Should get 404 because RLS prevents user A from seeing user B's connection
    expect(res.status).toBe(404);
  });

  // ── Validation ──

  it('should reject empty items array', async () => {
    const { token, connectionId } = await setupUserWithExtensionConnection(
      'empty@ext.com',
      'EmptyUser',
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/extension')
      .set('Authorization', `Bearer ${token}`)
      .send(buildSyncPayload('twitter', connectionId, []));

    // ValidationPipe should reject empty array (ArrayMinSize(1))
    expect(res.status).toBe(400);
  });
});
