# Tasks: Multi-Platform Content Aggregator

**Input**: Design documents from `/specs/001-content-aggregator/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Included per user story. Write tests FIRST, ensure they FAIL before implementation.

**Organization**: Tasks grouped by user story. Each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo initialization, tooling, Docker infrastructure

- [x] T001 Initialize Turborepo monorepo with `packages/backend`, `packages/frontend`, `packages/extension`, `packages/shared` workspaces. Create root `package.json`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc` (Node 20 LTS). Package manager: pnpm.
- [x] T002 [P] Configure `packages/backend` — Initialize NestJS 10.x project with TypeScript. Install core deps: `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/bullmq`, `drizzle-orm`, `pg`, `bullmq`, `bcrypt`, `@nestjs/jwt`, `@nestjs/passport`, `class-validator`, `class-transformer`. Create `src/main.ts`, `src/app.module.ts`.
- [x] T003 [P] Configure `packages/frontend` — Initialize Next.js 15.x with App Router, React 19, TypeScript. Install: `tailwindcss@4`, `@tanstack/react-query@5`, `next-intl`. Initialize shadcn/ui. Create base layout `src/app/layout.tsx`.
- [x] T004 [P] Configure `packages/extension` — Create Manifest V3 Chrome extension scaffold. Create `src/manifest.json` with strict `host_permissions` (xiaohongshu.com, x.com, twitter.com). Create `src/background/service-worker.ts`, `src/popup/index.html`. Build tooling: Vite or webpack for extension bundling.
- [x] T005 [P] Configure `packages/shared` — Create shared TypeScript package with `types/`, `dto/`, `constants/` directories. Export platform IDs, content types, sync payload DTOs, connector interfaces as defined in `contracts/connector.md`.
- [x] T006 [P] Create `docker-compose.yml` at repo root — PostgreSQL 16 (`localhost:5432`, db: `aggregator_dev`, user: `postgres`) + Redis 7 (`localhost:6379`). Add healthcheck for both services.
- [x] T007 [P] Configure development tooling — ESLint (flat config), Prettier, Vitest (root + per-package), Playwright (frontend E2E). Create root scripts: `dev`, `build`, `test`, `lint`, `format`, `typecheck`.
- [x] T008 [P] Create environment config — `packages/backend/.env.example` and `packages/frontend/.env.example` per quickstart.md. Add `packages/backend/src/common/config/` with typed NestJS `ConfigModule` setup.

**Checkpoint**: `pnpm install` succeeds, `pnpm build` compiles all 4 packages, `docker-compose up -d` starts PostgreSQL + Redis.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can start

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Create Drizzle ORM schema definitions in `packages/backend/src/common/database/schema/` — Define all 6 tables (`users`, `platform_connections`, `content_items`, `digests`, `digest_items`, `sync_jobs`) per data-model.md. Create `drizzle.config.ts` at repo root.
- [x] T010 Generate and apply initial database migration — `packages/backend/drizzle/` migrations directory. Include all tables, indexes, composite unique constraints (`user_id, platform, external_id`), and foreign keys.
- [x] T011 Implement Row-Level Security (RLS) — SQL migration to enable RLS on all user-scoped tables. Create RLS policies per data-model.md. Implement Drizzle `setLocal` middleware in `packages/backend/src/common/database/rls.middleware.ts` to inject `app.current_user_id` session variable per request.
- [x] T012 [P] Implement database module — `packages/backend/src/common/database/database.module.ts`. Drizzle provider with connection pooling. Transaction helper with RLS context.
- [x] T013 [P] Implement authentication module — `packages/backend/src/auth/`. JWT strategy (`@nestjs/jwt`, `@nestjs/passport`). Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` per rest-api.md. Password hashing with bcrypt. Refresh token rotation. `JwtAuthGuard` for protected routes.
- [x] T014 [P] Implement global error handling — `packages/backend/src/common/filters/http-exception.filter.ts`. Unified error response format per rest-api.md (`statusCode`, `error`, `message`, `details[]`). Validation pipe with `class-validator`.
- [x] T015 [P] Implement users module — `packages/backend/src/users/`. `GET /users/me`, `PATCH /users/me` endpoints per rest-api.md. User service with RLS-scoped queries.
- [x] T016 [P] Implement BullMQ infrastructure — `packages/backend/src/sync/sync.module.ts`. Queue setup with Redis connection. Bull Board dashboard at `/admin/queues` (dev only). Base processor skeleton.
- [x] T017 [P] Implement connector registry — `packages/backend/src/connectors/connector.registry.ts` and `packages/backend/src/connectors/interfaces/` per connector.md. `ConnectorRegistry` service, `PlatformConnector` interface, `ConnectorError` class, `ConnectorErrorCode` type.

**Checkpoint**: Auth endpoints work (`register → login → access protected route`). RLS isolates data between two test users. BullMQ dashboard accessible. Connector registry accepts mock registrations.

---

## Phase 3: User Story 1 — First-Time Setup & Platform Connection (Priority: P1) 🎯 MVP

**Goal**: User signs up, installs extension, connects GitHub via API token, sees activity in unified feed.

**Independent Test**: Create account → connect GitHub with PAT → verify starred repos/activity appears in feed within 2 minutes.

### Tests for User Story 1

> Write these tests FIRST, ensure they FAIL before implementation

- [x] T018 [P] [US1] Integration test for auth flow — `packages/backend/test/integration/auth.spec.ts`. Test register → login → refresh → access protected route → RLS isolation between users. Use Testcontainers (PostgreSQL).
- [x] T019 [P] [US1] Integration test for GitHub connector — `packages/backend/test/integration/github-connector.spec.ts`. Test fetchContent with mocked GitHub API responses → verify normalized ContentItemInput output. Test healthCheck with valid/invalid tokens.
- [x] T020 [P] [US1] Integration test for connection management — `packages/backend/test/integration/connections.spec.ts`. Test create/list/update/delete/test connections. Verify RLS isolation (user A cannot see user B's connections).
- [x] T021 [P] [US1] Integration test for content feed — `packages/backend/test/integration/content-feed.spec.ts`. Test paginated feed query, platform filter, date range filter, search. Verify chronological sort. Verify deduplication (upsert).

### Implementation for User Story 1

- [x] T022 [US1] Implement GitHub connector — `packages/backend/src/connectors/github/github.connector.ts`. Implement `PlatformConnector` interface: `healthCheck` (verify PAT), `fetchContent` (starred repos, events API, releases), `parseResponse` (normalize to ContentItemInput). Handle pagination. Map to content types: `release`, `commit`, `issue`.
- [x] T023 [US1] Implement platform connections module — `packages/backend/src/connections/`. CRUD endpoints per rest-api.md: `GET /connections`, `POST /connections`, `PATCH /connections/:id`, `DELETE /connections/:id`, `POST /connections/:id/test`. Store encrypted auth_data. Validate platform-specific config. Register connector on creation.
- [x] T024 [US1] Implement content module — `packages/backend/src/content/`. `GET /content` with pagination, platform/type/date filters, full-text search. `GET /content/:id`. Upsert service for deduplication (`ON CONFLICT (user_id, platform, external_id) DO UPDATE`).
- [x] T025 [US1] Implement sync job for API connectors — `packages/backend/src/sync/api-sync.processor.ts`. BullMQ processor that: fetches connection → gets connector from registry → calls `fetchContent(since: last_sync_at)` → upserts content items → updates `last_sync_at` → creates sync_job audit record. Error handling per connector.md error contract (AUTH_EXPIRED → mark error, RATE_LIMITED → backoff retry).
- [x] T026 [US1] Implement sync scheduling — `packages/backend/src/sync/sync.scheduler.ts`. On backend startup: query all active API connections → create BullMQ Repeatable Jobs per `sync_interval_minutes`. Endpoints: `GET /sync/jobs` (list recent jobs). On connection create/update/delete → add/update/remove repeatable job.
- [x] T027 [US1] Frontend — Auth pages — `packages/frontend/src/app/(auth)/login/page.tsx`, `register/page.tsx`. Login/register forms with validation. JWT token storage (httpOnly cookie or secure localStorage). API client setup with TanStack Query + axios/fetch wrapper in `packages/frontend/src/lib/api-client.ts`.
- [x] T028 [US1] Frontend — Platform connection page — `packages/frontend/src/app/(dashboard)/connections/page.tsx`. List connections with status indicators. "Add connection" flow: select platform → enter API token (GitHub) or OAuth flow (YouTube). Test connection button. Disconnect button.
- [x] T029 [US1] Frontend — Content feed page — `packages/frontend/src/app/(dashboard)/feed/page.tsx`. Infinite scroll feed using `useInfiniteQuery`. Platform filter chips. Date range picker. Search input. Content cards showing: platform icon, title, body preview, author, timestamp, original link.
- [x] T030 [US1] Frontend — Dashboard layout — `packages/frontend/src/app/(dashboard)/layout.tsx`. Sidebar navigation (Feed, Connections, Digests, Settings). Top bar with user info. Responsive layout. shadcn/ui components.

**Checkpoint**: Full flow works — register → login → connect GitHub → sync fires → content appears in feed → pagination/filter/search work. Two users have isolated data.

---

## Phase 4: User Story 2 — Browser Extension Content Collection (Priority: P1) 🎯 MVP

**Goal**: Extension intercepts Xiaohongshu/Twitter feed responses, buffers and syncs to backend.

**Independent Test**: Log into Xiaohongshu → activate extension → wait for sync cycle → posts appear in cloud dashboard.

### Tests for User Story 2

- [x] T031 [P] [US2] Unit test for Xiaohongshu response parser — `packages/extension/test/content/xiaohongshu-parser.spec.ts`. Parse sample API response JSON → verify normalized ContentItemInput output (external_id, title, body, media_urls, metadata with likes/collects/comments, author, published_at).
- [x] T032 [P] [US2] Unit test for Twitter response parser — `packages/extension/test/content/twitter-parser.spec.ts`. Parse sample GraphQL response JSON → verify normalized ContentItemInput (tweet text, media, retweets, likes, hashtags).
- [x] T033 [P] [US2] Unit test for service worker buffer — `packages/extension/test/background/sync-buffer.spec.ts`. Test buffer add/read/clear in mock `chrome.storage.local`. Test buffer overflow handling (max 500 items). Test dedup within buffer.
- [x] T034 [P] [US2] Integration test for extension sync endpoint — `packages/backend/test/integration/extension-sync.spec.ts`. Test `POST /api/v1/sync/extension` per extension-sync.md. Verify batch upsert, partial success (207), auth validation, rate limiting.
- [x] T035 [P] [US2] Integration test for heartbeat endpoint — `packages/backend/test/integration/heartbeat.spec.ts`. Test `POST /api/v1/sync/heartbeat` per extension-sync.md. Verify connection status update on error report.

### Implementation for User Story 2

- [x] T036 [US2] Implement Xiaohongshu content script (MAIN world) — `packages/extension/src/content/xiaohongshu/interceptor.ts`. Patch `window.fetch` to intercept responses from `/api/sns/web/v1/feed`. Parse response → extract posts. Post to bridge via `window.postMessage`. Patch `Function.prototype.toString` for stealth. MUST NOT: mutate DOM, simulate clicks, make additional requests (FR-022).
- [x] T037 [US2] Implement Twitter content script (MAIN world) — `packages/extension/src/content/twitter/interceptor.ts`. Patch `window.fetch` to intercept GraphQL API responses (`/graphql/`). Parse tweet objects. Post to bridge via `window.postMessage`. Same stealth and passive constraints.
- [x] T038 [US2] Implement bridge scripts (ISOLATED world) — `packages/extension/src/bridge/bridge.ts`. Listen for `window.postMessage` from MAIN world (verify `source === 'aggregator-main'`). Relay to service worker via `chrome.runtime.sendMessage`. One bridge script, platform-agnostic.
- [x] T039 [US2] Implement service worker sync scheduler — `packages/extension/src/background/service-worker.ts`. Listen for `CONTENT_COLLECTED` messages → buffer in `chrome.storage.local` (structure per extension-sync.md). Schedule sync via `chrome.alarms` at configured interval. On alarm: read buffer → POST to `/api/v1/sync/extension` → clear synced items. Exponential backoff on failure (`min(2^error_count * 60, 3600)` seconds). After 5 consecutive failures → mark error via heartbeat.
- [x] T040 [US2] Implement extension popup UI — `packages/extension/src/popup/`. Login form (aggregator JWT auth). Connection status per platform (active/error/disconnected). Last sync time. Items buffered count. Manual sync trigger button. Error messages with actionable guidance.
- [x] T041 [US2] Backend — Extension sync endpoint — `packages/backend/src/sync/extension-sync.controller.ts`. `POST /api/v1/sync/extension` per extension-sync.md. Validate JWT + connection_id ownership. Batch upsert content items. Return accepted/duplicates_updated/errors. Support 207 partial success.
- [x] T042 [US2] Backend — Heartbeat endpoint — `packages/backend/src/sync/heartbeat.controller.ts`. `POST /api/v1/sync/heartbeat` per extension-sync.md. Update connection `last_sync_at`, `status`, `last_error`, `error_count`.
- [x] T043 [US2] Implement Xiaohongshu connector (backend-side parser) — `packages/backend/src/connectors/xiaohongshu/xiaohongshu.connector.ts`. Implement `PlatformConnector` interface with `type: 'extension'`. `healthCheck` checks recent heartbeat. `fetchContent` is no-op (extension pushes). `parseResponse` normalizes incoming sync payloads.
- [x] T044 [US2] Implement Twitter connector (backend-side parser) — `packages/backend/src/connectors/twitter/twitter.connector.ts`. Same pattern as Xiaohongshu connector. `type: 'extension'`. Parse incoming tweet data from extension sync.

**Checkpoint**: Extension loaded in Chrome → log into Xiaohongshu → browse feed → extension intercepts → buffer fills → sync fires → posts appear in dashboard. Same for Twitter. No platform credentials transmitted (verify sync payload). Extension manifest has strict host_permissions.

---

## Phase 5: User Story 3 — Server-Side Collection for Open Platforms (Priority: P2)

**Goal**: YouTube syncs automatically via OAuth without browser being open.

**Independent Test**: Connect YouTube via OAuth → close browser → wait for sync → new videos from subscriptions appear in feed.

### Tests for User Story 3

- [x] T045 [P] [US3] Integration test for YouTube connector — `packages/backend/test/integration/youtube-connector.spec.ts`. Test fetchContent with mocked YouTube Data API responses. Test OAuth token refresh. Test quota tracking.
- [x] T046 [P] [US3] Unit test for YouTube response parser — `packages/backend/test/unit/youtube-parser.spec.ts`. Parse sample YouTube API JSON → verify ContentItemInput (video title, channel, duration, view count, thumbnail).

### Implementation for User Story 3

- [x] T047 [US3] Implement YouTube connector — `packages/backend/src/connectors/youtube/youtube.connector.ts`. Implement `PlatformConnector`: `healthCheck` (verify OAuth token), `fetchContent` (subscriptions → channel videos via Activities API), `parseResponse`. OAuth 2.0 token refresh flow. Track API quota usage (10,000 units/day). Content types: `video`.
- [x] T048 [US3] Implement YouTube OAuth flow — `packages/backend/src/auth/youtube-oauth.controller.ts`. OAuth 2.0 consent screen redirect → callback → store encrypted tokens in `platform_connections.auth_data`. Frontend: "Connect YouTube" button → redirect → callback page.
- [x] T049 [US3] Frontend — YouTube connection flow — `packages/frontend/src/app/(dashboard)/connections/youtube/callback/page.tsx`. OAuth callback handler. Display success/error. Redirect to connections page.

**Checkpoint**: Connect YouTube → OAuth flow completes → scheduled sync fetches subscription videos → videos appear in feed with thumbnails and metadata. Works without browser open.

---

## Phase 6: User Story 4 — AI-Powered Digest (Priority: P2)

**Goal**: AI generates daily/weekly topic-grouped summaries from collected content.

**Independent Test**: Have 20+ posts → trigger digest → output has topic groups, trend analysis, per-item summaries.

### Tests for User Story 4

- [x] T050 [P] [US4] Integration test for digest generation — `packages/backend/test/integration/digest.spec.ts`. Test with 20+ mock content items → verify digest output structure (topic_groups, trend_analysis, item_count). Test with <5 items → individual summaries. Test language preference.
- [x] T051 [P] [US4] Unit test for digest prompt construction — `packages/backend/test/unit/digest-prompts.spec.ts`. Test map-reduce prompt building. Verify content grouping logic.

### Implementation for User Story 4

- [x] T052 [US4] Implement digest module — `packages/backend/src/digest/digest.module.ts`. LangChain.js setup with configurable provider (OpenAI default, user can set API key). Map-reduce pipeline: summarize individual items → group by topic → generate cross-platform trend analysis. Handle <5 items edge case (individual summaries only).
- [x] T053 [US4] Implement digest scheduling — `packages/backend/src/digest/digest.scheduler.ts`. BullMQ job: query user's `digest_frequency` + `digest_time` + `timezone` → create repeatable job. On trigger: fetch uncovered content items for period → run digest pipeline → save to `digests` table → link via `digest_items`.
- [x] T054 [US4] Implement digest API endpoints — `packages/backend/src/digest/digest.controller.ts`. `GET /digests` (paginated list), `POST /digests/generate` (manual trigger → 202 Accepted), `GET /digests/:id` (full digest), `GET /digests/:id/stream` (SSE for real-time generation progress).
- [x] T055 [US4] Frontend — Digest page — `packages/frontend/src/app/(dashboard)/digests/page.tsx`. List of digests with type/date/status. Digest detail view: topic groups as expandable cards, trend analysis section, linked content items. "Generate Now" button. SSE progress indicator during generation.
- [x] T056 [US4] Frontend — Settings page (digest config) — `packages/frontend/src/app/(dashboard)/settings/page.tsx`. Digest frequency toggle (daily/weekly). Preferred time picker. Language selector (zh/en). Content retention days. OpenAI API key input (user-configurable).

**Checkpoint**: 20+ content items collected → click "Generate Now" → SSE shows progress → digest appears with topic groups and trends. Scheduled digests fire at configured time.

---

## Phase 7: User Story 5 — Multi-User Data Isolation (Priority: P3)

**Goal**: Multiple users have fully isolated data — connections, content, digests.

**Independent Test**: Create users A and B → connect different platforms → verify zero data leakage.

### Tests for User Story 5

- [ ] T057 [P] [US5] Integration test for RLS isolation — `packages/backend/test/integration/rls-isolation.spec.ts`. Create 2 users → insert content for each → query with each user's RLS context → verify zero cross-user data leakage across all tables (connections, content_items, digests, sync_jobs).

### Implementation for User Story 5

- [ ] T058 [US5] RLS verification and hardening — Review all endpoints and queries to ensure RLS context is set before every database operation. Add integration test for edge cases: user A trying to access user B's connection by ID (should get 404, not 403 — no information leakage). Verify DELETE and PATCH operations are RLS-scoped.
- [ ] T059 [US5] Frontend — Account management — Ensure all API calls include auth token. Verify frontend never caches data across different user sessions. Logout clears all local state.

**Checkpoint**: Two users created → each connects platforms → each only sees own data. Direct ID access to other user's resources returns 404.

---

## Phase 8: User Story 6 — Extensible Connector Architecture (Priority: P3)

**Goal**: Adding a new platform = implement interface + register, no core code changes.

**Independent Test**: Create mock connector → register → verify it appears as available platform → no existing code modified.

### Tests for User Story 6

- [ ] T060 [P] [US6] Unit test for connector extensibility — `packages/backend/test/unit/connector-registry.spec.ts`. Create MockConnector implementing PlatformConnector → register → verify `get()`, `listRegistered()`. Verify error handling: unregistered platform throws `NotFoundException`. Verify all 4 real connectors implement the same interface.

### Implementation for User Story 6

- [ ] T061 [US6] Connector architecture validation — Verify all 4 connectors (GitHub, YouTube, Twitter, Xiaohongshu) implement `PlatformConnector` interface identically. Verify `ConnectorsModule` uses `onModuleInit` registration pattern per connector.md. Document the "add a new connector" guide in code comments.
- [ ] T062 [US6] Frontend — Dynamic platform list — `packages/frontend/src/app/(dashboard)/connections/page.tsx`. Fetch available platforms from `GET /connections/platforms` (backed by `ConnectorRegistry.listRegistered()`). Render connection options dynamically instead of hardcoded list. New connector = automatically appears in UI.

**Checkpoint**: `ConnectorRegistry.listRegistered()` returns all 4 platforms. Mock connector can be added with zero changes to existing code.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories

- [ ] T063 [P] i18n setup — `packages/frontend/src/i18n/`. Chinese (zh) and English (en) translations for all UI strings. `next-intl` configuration. Language switcher component.
- [ ] T064 [P] Structured logging — `packages/backend/src/common/logger/`. NestJS logger with structured JSON output. Request ID propagation. Sensitive data redaction (tokens, passwords).
- [ ] T065 [P] API rate limiting — `packages/backend/src/common/middleware/rate-limit.middleware.ts`. Redis-backed rate limiting per user. Configurable limits per endpoint group.
- [ ] T066 [P] Content retention cleanup — `packages/backend/src/content/retention.scheduler.ts`. BullMQ job: delete content_items older than user's `content_retention_days`. Run daily.
- [ ] T067 Security audit — Verify: extension sync payloads contain zero platform credentials (SC-010). Manifest permissions are strictly scoped (SC-011). Auth tokens encrypted at rest (FR-006). HTTPS-only sync (FR-021). No script injection on login/payment pages (FR-020).
- [ ] T068 Run quickstart.md validation — Follow quickstart.md from scratch on a clean environment. Fix any discrepancies. Verify all scripts in "Project Scripts Reference" work.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — P1, MVP critical
- **Phase 4 (US2)**: Depends on Phase 2 + T041/T042 from backend — P1, MVP critical
- **Phase 5 (US3)**: Depends on Phase 2 — P2, can run parallel with Phase 3/4
- **Phase 6 (US4)**: Depends on Phase 2 + content from any story — P2
- **Phase 7 (US5)**: Depends on Phase 2 (RLS already built) — P3, mostly verification
- **Phase 8 (US6)**: Depends on Phase 2 (connector registry) — P3, mostly verification
- **Phase 9 (Polish)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational)
    ↓
    ├── Phase 3 (US1: GitHub + Feed) ──────┐
    ├── Phase 4 (US2: Extension)           ├── Phase 9 (Polish)
    ├── Phase 5 (US3: YouTube)             │
    ├── Phase 6 (US4: AI Digest) ──────────┘
    ├── Phase 7 (US5: Multi-User) → mostly verification of Phase 2 RLS
    └── Phase 8 (US6: Extensibility) → mostly verification of Phase 2 registry
```

### Within Each User Story

1. Tests written FIRST → verify they FAIL
2. Models/schemas before services
3. Services before controllers/endpoints
4. Backend before frontend (API must exist for frontend to consume)
5. Core implementation before integration

### Parallel Opportunities

- **Phase 1**: T002–T008 all run in parallel
- **Phase 2**: T012–T017 all run in parallel (after T009–T011 complete)
- **Phase 3–5**: US1, US2, US3 can proceed in parallel after Phase 2 (if capacity allows)
- **Phase 6**: Can start once any story has produced content items
- **Within each story**: Tests marked [P] run in parallel; implementation follows sequentially

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2)
2. **STOP and VALIDATE**: GitHub + Extension content flows work end-to-end
3. Deploy/demo MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (GitHub + Feed) → Deploy MVP v0.1
3. US2 (Extension) → Deploy MVP v0.2 (core differentiator)
4. US3 (YouTube) → Deploy v0.3
5. US4 (AI Digest) → Deploy v0.4 (key value-add)
6. US5 + US6 + Polish → Deploy v1.0

---

## Task Count Summary

| Phase                        | Tasks          | Priority |
| ---------------------------- | -------------- | -------- |
| Phase 1: Setup               | T001–T008 (8)  | —        |
| Phase 2: Foundational        | T009–T017 (9)  | —        |
| Phase 3: US1 (GitHub + Feed) | T018–T030 (13) | P1 🎯    |
| Phase 4: US2 (Extension)     | T031–T044 (14) | P1 🎯    |
| Phase 5: US3 (YouTube)       | T045–T049 (5)  | P2       |
| Phase 6: US4 (AI Digest)     | T050–T056 (7)  | P2       |
| Phase 7: US5 (Multi-User)    | T057–T059 (3)  | P3       |
| Phase 8: US6 (Extensibility) | T060–T062 (3)  | P3       |
| Phase 9: Polish              | T063–T068 (6)  | —        |
| **Total**                    | **68 tasks**   |          |
