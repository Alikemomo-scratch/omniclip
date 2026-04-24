# Tasks: Multi-Platform Content Aggregator (V3 — Server-Side, 3 Platforms)

**Input**: `spec.md` (v3), `plan.md`, existing codebase
**Spec Version**: v3 (2026-04-21) — XHS removed, 3 platforms (GitHub, YouTube, X/Twitter)
**Key Change**: Twitter connector migrated from extension-push to server-side fetch via rettiwt-api

## Format: `[ID] [Flags] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[US#]**: Which user story this task belongs to
- **[BREAKING]**: Changes existing behavior — requires migration or careful coordination

## Current State Assessment

| Component | Current State | Target State |
|-----------|--------------|--------------|
| GitHub connector | ✅ Server-side (REST API + PAT) | No change |
| YouTube connector | ✅ Server-side (Data API + OAuth) | No change |
| Twitter connector | ❌ Extension-push (no-op fetchContent) | Server-side (rettiwt-api + cookie) |
| XHS connector | ❌ Exists but non-functional | **Delete entirely** |
| Browser extension | Exists (Twitter + XHS interceptors) | **Remove from MVP scope** |
| Frontend connections page | Exists (supports extension-type) | Add cookie/API-key input for Twitter |
| Credential encryption | Unknown | AES-256 for cookies |

---

## Phase 0: Cleanup — Remove XHS & Extension Dependencies

**Purpose**: Remove dead code and extension coupling before building new functionality.

**⚠️ CRITICAL**: Must complete before Phase 1 to avoid working on deleted code paths.

- [x] T001 [BREAKING] Delete XHS connector directory `packages/backend/src/connectors/xiaohongshu/` and all references in `connectors.module.ts`, `connector.registry.ts`, `index.ts`
- [x] T002 [P] Remove XHS from `packages/shared/` — delete any XHS-specific types, DTOs, constants (search for `xiaohongshu`, `xhs`, `RED` in shared package)
- [x] T003 [P] Remove XHS from frontend — delete any XHS connection UI, icons, instructions in `packages/frontend/src/`
- [x] T004 [P] Remove XHS from database — create migration to drop any XHS-specific enum values or seed data (e.g., platform enum `xiaohongshu` entry if exists)
- [x] T005 Update `packages/backend/src/connectors/connector.registry.ts` — remove XHS registration, verify GitHub/YouTube/Twitter are registered
- [x] T006 Verify build passes after XHS removal: `pnpm build` across all packages

**Checkpoint**: XHS completely removed. Build passes. No broken imports.

---

## Phase 1: Twitter Connector — Server-Side Migration (US2, P1)

**Purpose**: Rewrite Twitter connector from extension-push to server-side fetch using rettiwt-api.

**Goal (from spec US2)**: Users provide Twitter cookies → server fetches Following timeline automatically on schedule.

**POC Reference**: `poc/twitter-feed.ts` — verified working (101 tweets, cursor pagination, 2026-04-21).

### 1A: Dependencies & Infrastructure

- [x] T007 Add `rettiwt-api` to backend dependencies: `pnpm --filter backend add rettiwt-api`
- [x] T008 Verify Node.js engine constraint: rettiwt-api v7 requires Node ^22.21.0. Update `engines` field in root `package.json` and `packages/backend/package.json` if needed. Update AGENTS.md tech stack note.

### 1B: Connector Interface Update

- [x] T009 Review `PlatformConnector` interface in `packages/shared/` — ensure it supports both credential types: `api` (GitHub/YouTube tokens) and `cookie` (Twitter cookie/API key). Add `credentialType: 'pat' | 'oauth' | 'cookie' | 'api_key'` if not present.
- [x] T010 Add Twitter credential validation method to connector interface (or extend existing `healthCheck`): must call `rettiwt.user.details()` to verify cookie validity.

### 1C: Twitter Connector Rewrite

- [x] T011 [BREAKING] [US2] Rewrite `packages/backend/src/connectors/twitter/twitter.connector.ts`:
  - Change `type` from `'extension'` to `'api'`
  - Import and initialize `Rettiwt` from `rettiwt-api` with user's API key
  - Implement `fetchContent()`: call `rettiwt.user.followed(cursor?)` to fetch Following timeline
  - Implement cursor-based pagination: store `feed.next` cursor for incremental fetching
  - Implement `parseResponse()`: map `Tweet` objects to `ContentItemInput[]` (fullText, tweetBy, createdAt, likeCount, retweetCount, media, urls)
  - Implement `healthCheck()`: call `rettiwt.user.details()` to verify credentials are valid
  - Implement exponential backoff for Error 226 (behavioral detection) and 429 (rate limit)
- [x] T012 [P] [US2] Create `packages/backend/src/connectors/twitter/twitter.types.ts` — define internal types for Twitter credential storage format (API key string, or raw auth_token + ct0 to be base64-encoded)
- [x] T013 [US2] Implement `buildApiKeyFromCookies(authToken, ct0)` utility — same logic as `poc/twitter-feed.ts` lines 29-35. Users can provide either raw cookies or a pre-built API key.

### 1D: Tests

- [x] T014 [P] [US2] Write unit tests for Twitter connector in `packages/backend/test/unit/twitter-connector.spec.ts`:
  - Test `parseResponse()` with mock Tweet data → verify ContentItemInput mapping
  - Test `buildApiKeyFromCookies()` → verify base64 encoding format
  - Test `healthCheck()` with mock — valid credentials return healthy, invalid return unhealthy
  - Test `fetchContent()` error handling — Error 226 triggers backoff, 401/403 marks credential expired

**Checkpoint**: Twitter connector fetches real Following timeline via rettiwt-api. Unit tests pass.

---

## Phase 2: Credential Management (US2, P1)

**Purpose**: Secure storage and validation of Twitter cookies/API keys.

- [x] T015 [US2] Implement AES-256 credential encryption service in `packages/backend/src/common/crypto/credential-encryption.service.ts`:
  - Encrypt before DB write, decrypt before use
  - Encryption key from environment variable (`CREDENTIAL_ENCRYPTION_KEY`), NOT stored in DB
  - Support both string credentials (API key) and structured credentials (auth_token + ct0 JSON)
- [x] T016 [P] Write unit tests for encryption service — encrypt/decrypt roundtrip, different key = different ciphertext, key rotation support
- [x] T017 [US2] Update connection creation flow to validate Twitter credentials on submission:
  - Accept either: (a) API key from X Auth Helper, or (b) raw auth_token + ct0 cookies
  - If raw cookies provided, auto-build API key via `buildApiKeyFromCookies()`
  - Call `rettiwt.user.details()` to validate before saving
  - Reject with clear error if validation fails
- [x] T018 [US2] Implement credential expiration detection in sync job:
  - On 401/403 from rettiwt-api → mark connection as `credential_expired`
  - Stop further sync attempts for this connection
  - Notify user (create notification record in DB)
- [x] T019 [US2] Implement hard-delete of credentials on disconnect: when user removes Twitter connection, delete encrypted credentials from DB (not soft-delete)

**Checkpoint**: Twitter credentials encrypted at rest, validated on submission, expired credentials detected and flagged.

---

## Phase 3: Frontend — Twitter Connection Flow (US2, P1)

**Purpose**: Users can connect X/Twitter by providing cookies or API key through the web dashboard.

- [x] T020 [US2] Create Twitter connection dialog in `packages/frontend/src/`:
  - Tab 1 (recommended): "Use X Auth Helper extension" — step-by-step instructions + API key paste field
  - Tab 2 (fallback): "Manual cookie extraction" — instructions to copy auth_token + ct0 from DevTools
  - Show validation status (loading → success/error) after submission
  - Display masked credential preview after successful connection (e.g., "API Key: a2R0...●●●●")
- [x] T021 [P] [US2] Update Connections page to show Twitter connection status: Active / Credential Expired / Error / Syncing
  - "Credential Expired" state shows "Update Cookies" button with re-connection flow
  - "Active" state shows last sync time and next scheduled sync
- [x] T022 [P] [US2] Create notification component for credential expiration alerts — banner or toast that guides user to refresh their cookies
- [x] T023 Remove extension-related UI: any "Install Extension" prompts, extension status indicators, extension-based connection flows for Twitter

**Checkpoint**: Users can connect Twitter via web UI, see sync status, receive credential expiration alerts.

---

## Phase 4: Sync Scheduler Updates (US2, P2)

**Purpose**: Ensure the sync scheduler correctly handles the new server-side Twitter connector.

- [x] T024 [US2] Update `packages/backend/src/sync/sync.scheduler.ts` to handle Twitter as a server-side connector (was previously skipped as extension-type)
- [x] T025 [US2] Enforce minimum sync interval for Twitter: ≥ 30 minutes (FR-019). Reject user-configured intervals below this.
- [x] T026 [US2] Implement jitter for Twitter sync jobs: add ±20% random delay to avoid synchronized requests from multiple users hitting Twitter simultaneously
- [x] T027 [US2] Implement exponential backoff at scheduler level: on consecutive failures, increase delay (base × 2^n, capped at 1 hour)

**Checkpoint**: Twitter syncs run on schedule with rate-limit protection.

---

## Phase 5: Extension Deprecation (Cleanup)

**Purpose**: Remove browser extension from active development scope. Preserve code for potential future use.

- [x] T028 Remove extension build from `pnpm build` pipeline (turbo.json or workspace config)
- [x] T029 Update `README.md` — remove extension installation steps (Steps 6-7), update platform connection instructions to reflect cookie-based flow
- [x] T030 Update `packages/frontend/` — remove any extension detection code, extension download links, or extension-dependent features
- [x] T031 [P] Archive or gitignore `packages/extension/` — do NOT delete (may be useful for future XHS revival or other platforms)

**Checkpoint**: Extension is out of the build pipeline and user-facing docs. Code preserved for future.

---

## Phase 6: AI Digest Updates (US4, P2)

**Purpose**: Update AI digest to work with new Twitter content format from rettiwt-api.

- [x] T032 [US4] Update digest prompts in `packages/backend/src/digest/` to handle Twitter content (fullText, media, engagement metrics) instead of raw extension payloads
- [x] T033 [P] [US4] Verify cross-platform digest works with GitHub + YouTube + Twitter content mix

**Checkpoint**: AI digests correctly process content from all 3 active platforms.

---

## Phase 7: Integration Testing & Polish

**Purpose**: End-to-end verification of the complete 3-platform flow.

- [x] T034 End-to-end test: Create account → Connect GitHub (PAT) → Wait for sync → Verify feed shows releases
- [x] T035 End-to-end test: Connect Twitter (API key) → Wait for sync → Verify feed shows Following timeline tweets
- [x] T036 End-to-end test: Connect YouTube (OAuth) → Wait for sync → Verify feed shows subscription videos
- [x] T037 End-to-end test: Generate AI digest with content from all 3 platforms → Verify topic grouping and summaries
- [x] T038 Verify credential security: confirm no plain-text credentials in logs, API responses, or error messages
- [x] T039 Update all spec documents: `plan.md`, `research.md`, `contracts/connector.md`, `contracts/rest-api.md` to reflect v3 architecture (3 platforms, no extension)
- [x] T040 Final build verification: `pnpm build && pnpm test` passes across all packages

---

## Dependencies & Execution Order

```
Phase 0 (Cleanup)
  └── Phase 1 (Twitter Connector)  ←  CRITICAL PATH
        ├── Phase 2 (Credentials)    [can overlap with late Phase 1]
        ├── Phase 3 (Frontend)       [can overlap with late Phase 1]
        └── Phase 4 (Sync Scheduler) [depends on Phase 1 completion]
              └── Phase 5 (Extension Deprecation)  [independent, can start after Phase 0]
                    └── Phase 6 (AI Digest)  [depends on Phase 1]
                          └── Phase 7 (Integration Testing)  [depends on ALL above]
```

### Parallel Opportunities

- **Phase 0**: T002, T003, T004 can all run in parallel
- **Phase 1**: T012, T014 can run in parallel with T011
- **Phase 2**: T016 can run in parallel with T015
- **Phase 3**: T020, T021, T022 can run in parallel (different UI components)
- **Phase 5**: Can start immediately after Phase 0 (independent of Phase 1-4)

### Estimated Effort

| Phase | Tasks | Effort | Parallel? |
|-------|-------|--------|-----------|
| Phase 0: Cleanup | 6 | 1 day | Yes (T002-T004) |
| Phase 1: Twitter Connector | 8 | 2-3 days | Partial |
| Phase 2: Credentials | 5 | 1-2 days | Partial |
| Phase 3: Frontend | 4 | 1-2 days | Yes (T020-T022) |
| Phase 4: Sync Scheduler | 4 | 1 day | No |
| Phase 5: Extension Deprecation | 4 | 0.5 day | Yes (T031) |
| Phase 6: AI Digest | 2 | 0.5 day | Yes |
| Phase 7: Testing | 7 | 1-2 days | Partial |
| **Total** | **40** | **~8-12 days** | |
