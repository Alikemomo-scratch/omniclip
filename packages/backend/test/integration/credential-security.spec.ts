/**
 * Credential Security Integration Tests
 * Verifies that credentials are never exposed in plain text in API responses or error messages.
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

// Known fake credentials used throughout these tests
const FAKE_AUTH_TOKEN = 'FAKE_TOKEN_123';
const FAKE_CT0 = 'FAKE_CT0_456';
const FAKE_PAT = 'FAKE_PAT_789';

describe('Credential Security (Integration)', () => {
  let app: INestApplication;
  let connectionString: string;
  let testPool: Pool;

  async function registerAndGetToken(email: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', display_name: name });
    return res.body.access_token;
  }

  /**
   * Recursively stringify a value and check that it does NOT contain any of the
   * provided secret strings.
   */
  function assertNoSecretsInBody(body: unknown, secrets: string[]): void {
    const serialized = JSON.stringify(body);
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
  }

  beforeAll(async () => {
    const result = await startTestDatabase();
    connectionString = result.connectionString;
    testPool = result.pool;

    // Provide an encryption key so auth_data is encrypted before storage
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-ok!';

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

  it('GET /api/v1/connections should NOT return raw credentials in the list response', async () => {
    const token = await registerAndGetToken('sec-list@example.com', 'SecList');

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'twitter',
        connection_type: 'api',
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assertNoSecretsInBody(res.body, [FAKE_AUTH_TOKEN, FAKE_CT0]);
  });

  it('GET /api/v1/connections/:id should NOT return decrypted credentials', async () => {
    const token = await registerAndGetToken('sec-get@example.com', 'SecGet');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'github',
        connection_type: 'api',
        auth_data: { personal_access_token: FAKE_PAT },
      })
      .expect(201);

    const connectionId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assertNoSecretsInBody(res.body, [FAKE_PAT]);
  });

  it('POST /api/v1/connections create response should NOT echo back submitted credentials', async () => {
    const token = await registerAndGetToken('sec-create@example.com', 'SecCreate');

    const res = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'twitter',
        connection_type: 'api',
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(201);

    assertNoSecretsInBody(res.body, [FAKE_AUTH_TOKEN, FAKE_CT0]);
  });

  it('PATCH /api/v1/connections/:id update response should NOT expose credentials', async () => {
    const token = await registerAndGetToken('sec-update@example.com', 'SecUpdate');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'github',
        connection_type: 'api',
        auth_data: { personal_access_token: FAKE_PAT },
      })
      .expect(201);

    const connectionId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/connections/${connectionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sync_interval_minutes: 60 })
      .expect(200);

    assertNoSecretsInBody(res.body, [FAKE_PAT]);
  });

  it('Error response when creating a duplicate connection should NOT contain submitted credentials', async () => {
    const token = await registerAndGetToken('sec-dup@example.com', 'SecDup');

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'twitter',
        connection_type: 'api',
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'twitter',
        connection_type: 'api',
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(409);

    assertNoSecretsInBody(res.body, [FAKE_AUTH_TOKEN, FAKE_CT0]);
  });

  it('Validation error response should NOT contain submitted credential values', async () => {
    const token = await registerAndGetToken('sec-val@example.com', 'SecVal');

    const res = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'invalid_platform',
        connection_type: 'api',
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(400);

    assertNoSecretsInBody(res.body, [FAKE_AUTH_TOKEN, FAKE_CT0]);
  });

  it('404 error response should NOT contain credential values from the request', async () => {
    const token = await registerAndGetToken('sec-404@example.com', 'Sec404');

    const res = await request(app.getHttpServer())
      .patch('/api/v1/connections/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sync_interval_minutes: 30,
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(404);

    assertNoSecretsInBody(res.body, [FAKE_AUTH_TOKEN, FAKE_CT0]);
  });

  it('Connections list should not contain auth_data or encrypted_auth_data fields', async () => {
    const token = await registerAndGetToken('sec-fields@example.com', 'SecFields');

    await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'github',
        connection_type: 'api',
        auth_data: { personal_access_token: FAKE_PAT },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const connections: Record<string, unknown>[] = res.body.connections ?? [];
    expect(connections).toHaveLength(1);

    const conn = connections[0];
    expect(conn).not.toHaveProperty('auth_data');
    expect(conn).not.toHaveProperty('encrypted_auth_data');
    expect(conn).not.toHaveProperty('authData');
    expect(conn).not.toHaveProperty('encryptedAuthData');
  });

  it('Single connection GET should not contain auth_data or encrypted_auth_data fields', async () => {
    const token = await registerAndGetToken('sec-fields2@example.com', 'SecFields2');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'twitter',
        connection_type: 'api',
        auth_data: { auth_token: FAKE_AUTH_TOKEN, ct0: FAKE_CT0 },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/connections/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).not.toHaveProperty('auth_data');
    expect(res.body).not.toHaveProperty('encrypted_auth_data');
    expect(res.body).not.toHaveProperty('authData');
    expect(res.body).not.toHaveProperty('encryptedAuthData');
  });
});
