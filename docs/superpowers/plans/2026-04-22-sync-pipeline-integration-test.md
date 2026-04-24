# Sync Pipeline Integration Test Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a comprehensive integration test for the full sync pipeline across GitHub, Twitter, and YouTube, including AI digest generation.

**Architecture:** 
The test uses `testcontainers` for a real PostgreSQL database, bootstraps the NestJS app, and overrides the `ConnectorRegistry` with mock connectors to return canned data. It directly invokes the `SyncProcessor` (bypassing the BullMQ queue) and verifies results via API endpoints.

**Tech Stack:** Vitest, Supertest, NestJS, Drizzle ORM, Testcontainers.

---

### Task 1: Initialize Test File Structure

**Files:**
- Create: `packages/backend/test/integration/sync-pipeline.spec.ts`

- [ ] **Step 1: Write the initial test file structure with imports and setup/teardown**
- [ ] **Step 2: Implement helper functions: `registerUser`, `createConnection`, and `createMockConnector`**
- [ ] **Step 3: Set up `beforeAll` to start DB and create app with encryption key**
- [ ] **Step 4: Set up `beforeEach` to truncate tables**
- [ ] **Step 5: Verify compilation**

### Task 2: Implement T034 (GitHub PAT Sync)

**Files:**
- Modify: `packages/backend/test/integration/sync-pipeline.spec.ts`

- [ ] **Step 1: Write the GitHub sync test case**
- [ ] **Step 2: Mock GitHub connector in the registry**
- [ ] **Step 3: Register user, create connection, and run sync processor**
- [ ] **Step 4: Verify items appear in `/api/v1/content?platform=github`**
- [ ] **Step 5: Verify `sync_jobs` record exists**

### Task 3: Implement T035 (Twitter API Key Sync)

**Files:**
- Modify: `packages/backend/test/integration/sync-pipeline.spec.ts`

- [ ] **Step 1: Write the Twitter sync test case**
- [ ] **Step 2: Mock Twitter connector in the registry**
- [ ] **Step 3: Register user, create connection, and run sync processor**
- [ ] **Step 4: Verify items appear in `/api/v1/content?platform=twitter`**

### Task 4: Implement T036 (YouTube OAuth Sync)

**Files:**
- Modify: `packages/backend/test/integration/sync-pipeline.spec.ts`

- [ ] **Step 1: Write the YouTube sync test case**
- [ ] **Step 2: Mock YouTube connector in the registry**
- [ ] **Step 3: Register user, create connection, and run sync processor**
- [ ] **Step 4: Verify items appear in `/api/v1/content?platform=youtube`**

### Task 5: Implement T037 (Multi-platform AI Digest)

**Files:**
- Modify: `packages/backend/test/integration/sync-pipeline.spec.ts`

- [ ] **Step 1: Write the multi-platform AI digest test case**
- [ ] **Step 2: Mock all 3 connectors**
- [ ] **Step 3: Sync all 3 platforms**
- [ ] **Step 4: Trigger digest generation via `POST /api/v1/digests/generate`**
- [ ] **Step 5: Verify digest completion and content coverage**

### Task 6: Final Verification

- [ ] **Step 1: Run compilation check: `pnpm --filter backend exec tsc --noEmit`**
- [ ] **Step 2: Ensure all Must-Dos are met**
