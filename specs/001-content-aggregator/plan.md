# Implementation Plan: Multi-Platform Content Aggregator

**Branch**: `001-content-aggregator` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-content-aggregator/spec.md`

## Summary

Build a multi-platform content aggregation SaaS that collects followed content from GitHub, YouTube, X/Twitter, and Xiaohongshu via a hybrid architecture: browser extension (for anti-scraping platforms) + server-side APIs (for open platforms). Content is stored in a multi-tenant PostgreSQL backend and processed by an AI digest pipeline to generate daily/weekly summaries.

**Technical approach**: TypeScript monorepo with three sub-projects — NestJS backend (API + job scheduling), Next.js frontend (dashboard + feed), Chrome extension (Manifest V3, Content-Bridge-Worker pattern). PostgreSQL with Row-Level Security for multi-tenant data isolation. BullMQ + Redis for periodic sync job scheduling. LangChain.js for AI digest generation.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20 LTS)
**Primary Dependencies**:

- Backend: NestJS 10.x, BullMQ 5.x, Drizzle ORM (latest stable), LangChain.js
- Frontend: Next.js 15.x, React 19, shadcn/ui, TanStack Query v5, Tailwind CSS 4
- Extension: Chrome Extension Manifest V3 APIs, chrome.alarms, chrome.storage
  **Storage**: PostgreSQL 16 + Redis 7 (BullMQ job queue + caching)
  **Testing**: Vitest (unit + integration), Playwright (E2E for frontend), Chrome Extension Testing (jest-chrome)
  **Target Platform**: Linux server (backend), Web browser (frontend), Chrome/Chromium (extension)
  **Project Type**: web-service + browser-extension (multi-project)
  **Performance Goals**: API response <200ms p95, sync job throughput 100 users/min, digest generation <60s per user
  **Constraints**: Extension must not trigger platform anti-bot measures, all sync payloads HTTPS-only, no platform credentials transmitted, service worker 30s idle timeout (MV3)
  **Scale/Scope**: 1,000 concurrent users (MVP), 4 platform connectors, ~15 screens (frontend dashboard)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                    | Status | Evidence                                                                                                                                |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| I. Code Quality              | PASS   | Monorepo with clear module boundaries; NestJS enforces modular architecture; Drizzle ORM provides explicit schema definitions           |
| II. Testing Standards        | PASS   | Vitest for unit/integration, Playwright for E2E, jest-chrome for extension; each layer tested appropriately                             |
| III. UX Consistency          | PASS   | shadcn/ui component library ensures visual consistency; next-intl for i18n (Chinese + English); actionable error states defined in spec |
| IV. Performance Requirements | PASS   | Specific metrics defined: <200ms API p95, 100 users/min sync, <60s digest. Will verify with load tests                                  |
| V. Observability             | PASS   | NestJS built-in logger + structured logging; BullMQ dashboard for job monitoring; extension health-check reporting                      |
| VI. Language Standard        | PASS   | All code/comments in English; user-facing content supports Chinese via i18n                                                             |
| VII. Communication Protocol  | PASS   | Agent communicates with user in Chinese; all internal reasoning in English                                                              |

**Result**: All gates PASS. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-content-aggregator/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions & rationale
├── data-model.md        # Phase 1 output — entity schemas & relationships
├── quickstart.md        # Phase 1 output — local dev setup guide
├── contracts/           # Phase 1 output — API contracts
│   ├── rest-api.md      # Backend REST API endpoints
│   ├── extension-sync.md # Extension ↔ Backend sync protocol
│   └── connector.md     # Platform connector interface
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── backend/                    # NestJS backend service
│   ├── src/
│   │   ├── auth/               # Authentication module (JWT, OAuth)
│   │   ├── connectors/         # Platform connector modules
│   │   │   ├── github/         # GitHub API connector
│   │   │   ├── youtube/        # YouTube API connector
│   │   │   └── interfaces/     # Connector interface definitions
│   │   ├── content/            # Content CRUD & feed module
│   │   ├── digest/             # AI digest generation module
│   │   ├── sync/               # Sync job scheduling (BullMQ)
│   │   ├── users/              # User management module
│   │   ├── common/             # Shared utilities, guards, filters
│   │   │   ├── database/       # Drizzle schema, migrations, RLS
│   │   │   └── config/         # Environment config
│   │   └── main.ts
│   └── test/
│       ├── unit/
│       └── integration/
│
├── frontend/                   # Next.js dashboard
│   ├── src/
│   │   ├── app/                # App Router pages
│   │   ├── components/         # UI components (shadcn/ui based)
│   │   ├── lib/                # API client, utilities
│   │   ├── hooks/              # Custom React hooks
│   │   └── i18n/               # Internationalization (zh/en)
│   └── tests/
│       ├── unit/
│       └── e2e/                # Playwright tests
│
├── extension/                  # Chrome extension (Manifest V3)
│   ├── src/
│   │   ├── background/         # Service worker (sync scheduler)
│   │   ├── content/            # Content scripts (per-platform)
│   │   │   ├── xiaohongshu/    # Xiaohongshu feed interceptor
│   │   │   └── twitter/        # X/Twitter feed interceptor
│   │   ├── bridge/             # ISOLATED world bridge scripts
│   │   ├── popup/              # Extension popup UI
│   │   ├── common/             # Shared types, utilities
│   │   └── manifest.json
│   └── test/
│
└── shared/                     # Shared TypeScript types & DTOs
    ├── types/                  # Common type definitions
    ├── dto/                    # Data Transfer Objects
    └── constants/              # Shared constants

docker-compose.yml              # Local dev: PostgreSQL + Redis
drizzle.config.ts               # Drizzle ORM configuration
turbo.json                      # Turborepo monorepo config
package.json                    # Root workspace config
tsconfig.base.json              # Shared TypeScript config
```

**Structure Decision**: Turborepo monorepo with 4 packages (`backend`, `frontend`, `extension`, `shared`). This enables shared TypeScript types/DTOs between all sub-projects while maintaining independent build/test pipelines. The `shared` package is the key advantage of a TypeScript monorepo — connector interfaces, content item types, and sync payload DTOs are defined once and consumed everywhere.

## Complexity Tracking

| Violation                                          | Why Needed                                                                                                                                                       | Simpler Alternative Rejected Because                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 4 sub-projects (backend/frontend/extension/shared) | Three distinct runtime targets (Node.js server, browser SPA, Chrome extension) require separate build pipelines and entry points                                 | A 2-project split would force extension code into frontend or backend, creating coupling and deployment complexity          |
| BullMQ + Redis (additional infrastructure)         | Per-user periodic sync scheduling with configurable intervals, retry logic, and dead-letter queues cannot be reliably achieved with simple `setInterval` or cron | Node.js cron libraries lack job persistence, distributed locking, and automatic retry — critical for multi-user reliability |
