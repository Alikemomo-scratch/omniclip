import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  time,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ============================================================
// 1. users
// ============================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    preferredLanguage: varchar('preferred_language', { length: 10 }).notNull().default('zh'),
    digestFrequency: varchar('digest_frequency', { length: 10 }).notNull().default('daily'),
    digestTime: time('digest_time').notNull().default('08:00'),
    timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Shanghai'),
    contentRetentionDays: integer('content_retention_days').notNull().default(90),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email)],
);

// ============================================================
// 2. platform_connections
// ============================================================
export const platformConnections = pgTable(
  'platform_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 30 }).notNull(),
    connectionType: varchar('connection_type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    authData: jsonb('auth_data'),
    syncIntervalMinutes: integer('sync_interval_minutes').notNull().default(60),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    errorCount: integer('error_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_pc_user_platform').on(table.userId, table.platform),
    index('idx_pc_status').on(table.status),
  ],
);

// ============================================================
// 3. content_items
// ============================================================
export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => platformConnections.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 30 }).notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 30 }).notNull(),
    title: text('title'),
    body: text('body'),
    mediaUrls: jsonb('media_urls').default([]),
    metadata: jsonb('metadata').default({}),
    authorName: varchar('author_name', { length: 255 }),
    authorUrl: varchar('author_url', { length: 500 }),
    originalUrl: varchar('original_url', { length: 500 }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    aiSummary: text('ai_summary'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_ci_dedup').on(table.userId, table.platform, table.externalId),
    index('idx_ci_feed').on(table.userId, table.publishedAt),
    index('idx_ci_platform_date').on(table.userId, table.platform, table.publishedAt),
    index('idx_ci_content_type').on(table.userId, table.contentType),
  ],
);

// ============================================================
// 4. digests
// ============================================================
export const digests = pgTable(
  'digests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    digestType: varchar('digest_type', { length: 10 }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    language: varchar('language', { length: 10 }).notNull(),
    topicGroups: jsonb('topic_groups').notNull(),
    trendAnalysis: text('trend_analysis'),
    itemCount: integer('item_count').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_digest_user_period').on(table.userId, table.periodEnd),
    index('idx_digest_status').on(table.status),
  ],
);

// ============================================================
// 5. digest_items (join table)
// ============================================================
export const digestItems = pgTable(
  'digest_items',
  {
    digestId: uuid('digest_id')
      .notNull()
      .references(() => digests.id, { onDelete: 'cascade' }),
    contentItemId: uuid('content_item_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.digestId, table.contentItemId] })],
);

// ============================================================
// 6. sync_jobs
// ============================================================
export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => platformConnections.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    itemsCollected: integer('items_collected'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sj_connection').on(table.connectionId, table.createdAt)],
);
