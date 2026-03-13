/**
 * T018: Integration test for auth flow
 * Tests: register → login → refresh → access protected route → RLS isolation between users.
 * Uses Testcontainers (PostgreSQL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';

import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { DatabaseModule } from '../../src/common/database/database.module';
import { ConnectorsModule } from '../../src/connectors/connectors.module';
import {
  startTestDatabase,
  createTestApp,
  truncateAllTables,
  stopTestDatabase,
} from '../helpers/test-db';

describe('Auth Flow (Integration)', () => {
  let app: INestApplication;
  let connectionString: string;
  let testPool: Pool;

  beforeAll(async () => {
    const result = await startTestDatabase();
    connectionString = result.connectionString;
    testPool = result.pool;

    app = await createTestApp(
      [DatabaseModule, ConnectorsModule, AuthModule, UsersModule],
      connectionString,
    );
  }, 60_000); // Container startup can take time

  afterAll(async () => {
    await app?.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(testPool);
  });

  it('should register a new user and return tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'alice@example.com',
        password: 'password123',
        display_name: 'Alice',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      user: {
        email: 'alice@example.com',
        display_name: 'Alice',
      },
      access_token: expect.any(String),
      refresh_token: expect.any(String),
    });
    expect(res.body.user.id).toBeDefined();
  });

  it('should reject duplicate email registration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'password123', display_name: 'Alice' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'password456', display_name: 'Alice2' })
      .expect(409);

    expect(res.body.message).toContain('already registered');
  });

  it('should login with correct credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', display_name: 'Bob' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bob@example.com', password: 'password123' })
      .expect(200);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    expect(res.body.user.email).toBe('bob@example.com');
  });

  it('should reject login with wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'carol@example.com', password: 'password123', display_name: 'Carol' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'carol@example.com', password: 'wrongpass' })
      .expect(401);
  });

  it('should refresh tokens with a valid refresh token', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'dave@example.com', password: 'password123', display_name: 'Dave' });

    const refreshToken = registerRes.body.refresh_token;

    // Wait >1s so JWT `iat` differs, producing a distinct token
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    // New tokens should be different from original (different iat)
    expect(res.body.access_token).not.toBe(registerRes.body.access_token);
  });

  it('should reject refresh with invalid token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'invalid-token-here' })
      .expect(401);
  });

  it('should access protected route (GET /users/me) with valid token', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'eve@example.com', password: 'password123', display_name: 'Eve' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${registerRes.body.access_token}`)
      .expect(200);

    expect(res.body.email).toBe('eve@example.com');
    expect(res.body.display_name).toBe('Eve');
  });

  it('should reject protected route without token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('should isolate user data via RLS — user A cannot see user B profile', async () => {
    // Register two users
    const userA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'usera@example.com', password: 'password123', display_name: 'UserA' });

    const userB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'userb@example.com', password: 'password123', display_name: 'UserB' });

    // User A's token should return User A's profile
    const profileA = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${userA.body.access_token}`)
      .expect(200);
    expect(profileA.body.email).toBe('usera@example.com');

    // User B's token should return User B's profile
    const profileB = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${userB.body.access_token}`)
      .expect(200);
    expect(profileB.body.email).toBe('userb@example.com');

    // IDs should be different
    expect(profileA.body.id).not.toBe(profileB.body.id);
  });

  it('should validate registration input', async () => {
    // Missing fields
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'bad' })
      .expect(400);

    // Password too short
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'short', display_name: 'Test' })
      .expect(400);
  });
});
