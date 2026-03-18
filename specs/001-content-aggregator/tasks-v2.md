---
description: 'Task list for Deep Platform Integration (V2)'
---

# Tasks: Multi-Platform Content Aggregator (V2 - Deep Platform Integration)

**Input**: Design documents from `/specs/001-content-aggregator/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), platform-tracking-design.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`

---

## Phase 1: Setup & Foundational (Shared Infrastructure)

**Purpose**: Project initialization for V2 and shared UI components for sync intervals.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T001 Update connection creation/edit UI to include a "Sync Interval" configuration field in `packages/frontend/src/app/(dashboard)/connections/page.tsx`
- [ ] T002 Add backend validation for custom `sync_interval_minutes` in `packages/backend/src/connections/dto/index.ts`
- [ ] T003 Verify `SyncScheduler` dynamic interval assignment logic in `packages/backend/src/sync/sync.scheduler.ts`

**Checkpoint**: Foundation ready - custom intervals can be set and saved.

---

## Phase 2: User Story 1 - GitHub Deep Integration (Priority: P1) 🎯 MVP for V2

**Goal**: Filter GitHub noise by tracking only high-value events (Releases, Opensourcing, Stars) from followed users, and fetching actual releases for Starred Repos.

**Independent Test**: Connect a GitHub account, set interval to 1 hour, verify that commits and issues are ignored, and only Releases/Watch events are synced.

### Tests for User Story 1

- [ ] T004 [P] [US1] Update unit tests to verify GitHub event filtering in `packages/backend/src/connectors/github/github.connector.spec.ts`

### Implementation for User Story 1

- [ ] T005 [US1] Refactor `parseEvents` in `packages/backend/src/connectors/github/github.connector.ts` to strictly keep `CreateEvent`, `ReleaseEvent`, `PublicEvent`, and `WatchEvent`, while dropping `PushEvent` and `IssuesEvent`.
- [ ] T006 [US1] Refactor starred repos fetching in `packages/backend/src/connectors/github/github.connector.ts` to fetch `/repos/{owner}/{repo}/releases` instead of logging the star action itself.

**Checkpoint**: At this point, GitHub connection yields extreme high-signal content.

---

## Phase 3: User Story 2 - YouTube Deep Integration (Priority: P2)

**Goal**: Ensure only actual videos from Subscriptions are tracked, avoiding Shorts and Community posts.

**Independent Test**: Connect a YouTube account, verify that Shorts are filtered out and only full videos from subscribed channels appear.

### Tests for User Story 2

- [ ] T007 [P] [US2] Update YouTube parser unit tests to verify Shorts filtering in `packages/backend/test/unit/youtube-parser.spec.ts`

### Implementation for User Story 2

- [ ] T008 [US2] Update `fetchContent` in `packages/backend/src/connectors/youtube/youtube.connector.ts` to strictly verify it only queries subscriptions and explicitly filters out `#shorts`.

**Checkpoint**: YouTube integration is now strictly signal-focused.

---

## Phase 4: User Story 3 - Extension Deep Integration (Twitter & Xiaohongshu) (Priority: P1)

**Goal**: Ensure browser extensions only intercept the explicit "Following" timelines, entirely ignoring algorithmic "For You" / "Discover" feeds.

**Independent Test**: Load the unpacked extension, navigate to Twitter "For You" (should not sync) and "Following" (should sync). Repeat for Xiaohongshu.

### Tests for User Story 3

- [ ] T009 [P] [US3] Update extension unit tests for Twitter interceptor in `packages/extension/test/content/twitter-parser.spec.ts`
- [ ] T010 [P] [US3] Update extension unit tests for Xiaohongshu interceptor in `packages/extension/test/content/xiaohongshu-parser.spec.ts`

### Implementation for User Story 3

- [ ] T011 [P] [US3] Modify Twitter content script in `packages/extension/src/content/twitter/interceptor.js` to only activate and intercept XHRs when the user is explicitly on the "Following" timeline tab.
- [ ] T012 [P] [US3] Modify Xiaohongshu content script in `packages/extension/src/content/xiaohongshu/interceptor.js` to only activate and intercept XHRs when the user is explicitly on the "关注" (Follow) feed.

**Checkpoint**: Extension platforms are fully isolated from algorithmic manipulation.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T013 [P] End-to-end verification of dynamic sync intervals overriding default 60-minute behavior.
- [ ] T014 [P] Update AI digest prompts in `packages/backend/src/digest/prompts/digest.prompts.ts` to better leverage the new high-signal release notes and video descriptions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 2, 3, 4)**: All depend on Foundational phase completion
  - Can proceed in parallel (if staffed)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1 - GitHub)**: No dependencies on other stories
- **User Story 2 (P2 - YouTube)**: No dependencies on other stories
- **User Story 3 (P1 - Extensions)**: No dependencies on other stories

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Logic updates before integration

### Parallel Opportunities

- T009, T010, T011, T012 can run in parallel since they touch isolated extension files.

---

## Parallel Example: User Story 3

```bash
# Launch extension interceptor modifications in parallel
Task: T011 [P] [US3] Modify Twitter content script
Task: T012 [P] [US3] Modify Xiaohongshu content script
```
