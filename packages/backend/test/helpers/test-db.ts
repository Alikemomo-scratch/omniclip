/**
 * Shared integration test helper — spins up a PostgreSQL Testcontainer,
 * applies migrations + RLS, and provides a bootstrapped NestJS app.
 */
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DRIZZLE } from '../../src/common/database/database.constants';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import * as schema from '../../src/common/database/schema';

let pgContainer: StartedPostgreSqlContainer;
let pool: Pool;
let db: NodePgDatabase<typeof schema>;
/** Pools created by createTestApp that need cleanup */
const appPools: Pool[] = [];

/**
 * Start a PostgreSQL Testcontainer and apply all migrations (schema + RLS).
 * Call this in `beforeAll` — the container is shared across all tests in the file.
 */
export async function startTestDatabase(): Promise<{
  container: StartedPostgreSqlContainer;
  connectionString: string;
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
}> {
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionString = pgContainer.getConnectionUri();

  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema });

  // Apply schema migration
  const migrationDir = path.resolve(__dirname, '../../drizzle');
  const schemaSql = fs.readFileSync(
    path.join(migrationDir, '0000_milky_doctor_spectrum.sql'),
    'utf-8',
  );
  // Drizzle uses --> statement-breakpoint as separator
  const statements = schemaSql.split('--> statement-breakpoint');
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (trimmed) {
      await pool.query(trimmed);
    }
  }

  // Apply RLS policies
  const rlsSql = fs.readFileSync(path.join(migrationDir, '0001_rls_policies.sql'), 'utf-8');
  await pool.query(rlsSql);

  // Create a non-superuser app role so RLS policies are enforced.
  // The superuser 'test' bypasses RLS; the app must connect as 'app_user'.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'app_pass';
      END IF;
    END
    $$;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;
    GRANT USAGE ON SCHEMA public TO app_user;
  `);

  // Build a connection string for the app_user role
  const url = new URL(connectionString);
  url.username = 'app_user';
  url.password = 'app_pass';
  const appConnectionString = url.toString();

  return { container: pgContainer, connectionString: appConnectionString, pool, db };
}

/**
 * Create a fully bootstrapped NestJS app with the test database.
 * Override the DRIZZLE provider with the Testcontainer-backed instance.
 */
export async function createTestApp(
  modules: any[],
  connectionString: string,
): Promise<INestApplication> {
  const testPool = new Pool({ connectionString });
  appPools.push(testPool);
  const testDb = drizzle(testPool, { schema });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            database: { url: connectionString },
            redis: { url: 'redis://localhost:6379' },
            jwt: {
              secret: 'test-secret-key-for-integration-tests',
              expiration: '15m',
              refreshExpiration: '7d',
            },
            openai: { apiKey: '' },
            youtube: {
              clientId: '',
              clientSecret: '',
              redirectUri: '',
            },
          }),
        ],
      }),
      ...modules,
    ],
  })
    .overrideProvider(DRIZZLE)
    .useValue(testDb)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return app;
}

/**
 * Truncate all tables (respecting FK order) for test isolation between tests.
 */
export async function truncateAllTables(testPool: Pool): Promise<void> {
  await testPool.query(`
    TRUNCATE TABLE digest_items, content_items, sync_jobs, digests, platform_connections, users CASCADE;
  `);
}

/**
 * Stop the test database container.
 */
export async function stopTestDatabase(): Promise<void> {
  // Close any pools created by createTestApp first
  for (const p of appPools) {
    try {
      await p.end();
    } catch {
      /* ignore */
    }
  }
  appPools.length = 0;

  if (pool) {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }
  if (pgContainer) await pgContainer.stop();
}
