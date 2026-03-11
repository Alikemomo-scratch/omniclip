import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/backend/src/common/database/schema/index.ts',
  out: './packages/backend/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/aggregator_dev',
  },
});
