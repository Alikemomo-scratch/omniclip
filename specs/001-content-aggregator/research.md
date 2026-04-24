# Research: Multi-Platform Content Aggregator

**Feature**: 001-content-aggregator
**Date**: 2026-03-10
**Purpose**: Resolve all Technical Context unknowns and document technology decisions with rationale.

---

## 1. Backend Framework

**Decision**: NestJS 10.x (TypeScript)

**Rationale**:

- Modular architecture (modules/controllers/services) aligns with the connector plugin pattern required by FR-012
- Native TypeScript support enables shared type definitions with frontend and extension via monorepo
- Built-in dependency injection simplifies testing and module composition
- First-class BullMQ integration via `@nestjs/bullmq` for job scheduling
- Large ecosystem with guards, interceptors, and pipes for auth/validation

**Alternatives considered**:

- **FastAPI (Python)**: Better AI/ML ecosystem, but forces a polyglot monorepo. Shared types between extension (TypeScript) and backend (Python) would require code generation (OpenAPI → TypeScript). Added complexity not justified for MVP.
- **Go (Gin/Echo)**: Superior raw performance, but weaker ORM ecosystem for PostgreSQL RLS. No shared type advantage with TypeScript frontend/extension. Better suited as a future optimization if throughput becomes a bottleneck.
- **Express.js (plain)**: Too minimal — would require manually assembling module system, DI container, and validation pipeline that NestJS provides out of the box.

---

## 2. Frontend Framework

**Decision**: Next.js 15.x + React 19 + shadcn/ui + TanStack Query v5 + Tailwind CSS 4

**Rationale**:

- React Server Components (RSC) enable streaming AI digest content to the client as it generates
- App Router provides file-system based routing with layouts, ideal for dashboard structure
- shadcn/ui provides high-quality, accessible, customizable components (not a dependency — copies source into project)
- TanStack Query v5's `useInfiniteQuery` is ideal for infinite-scroll content feeds
- `next-intl` for i18n (Chinese + English) with server-side rendering support
- Tailwind CSS 4 for utility-first styling with CSS-first configuration

**Alternatives considered**:

- **Nuxt 3 (Vue)**: Comparable feature set, but smaller ecosystem for dashboard component libraries. Vue's reactivity system is excellent but team expertise assumed in React.
- **SvelteKit**: Excellent DX and performance, but smallest ecosystem among the three. Fewer pre-built dashboard components available.

---

## 3. Chrome Extension Architecture (ARCHIVED v3)

**Status**: Archived in v3. All platforms migrated to server-side API connectors. Documentation retained for historical context.

**Rationale (Pre-v3)**:
- **MAIN world content script**: Intercepts platform's `fetch`/`XHR` API responses.
- **ISOLATED world bridge**: Relays intercepted data from MAIN world to service worker.
- **Service Worker (background)**: Schedules sync via `chrome.alarms`.

**Reason for Removal**:
- User experience: Required user to keep browser tabs open for sync.
- Maintenance: Heavy dependence on platform DOM/API stability.
- V3 Migration: Successful implementation of server-side `rettiwt-api` for Twitter and removal of XHS simplified architecture to 3 packages.

---

## 4. Database & Multi-Tenancy

**Decision**: PostgreSQL 16 with Shared Schema + Row-Level Security (RLS)

**Rationale**:

- Single database, single schema — all tenants share tables with a `user_id` column
- RLS policies enforce data isolation at the database level, not the application level
- Drizzle ORM's `setLocal` method cleanly injects the current user ID into PostgreSQL session variables for RLS policy evaluation
- Connection pooling via PgBouncer (Transaction Mode) for production scalability
- `platform_id + external_id` composite unique constraint with `ON CONFLICT DO UPDATE` for upsert-based deduplication (FR-007, SC-008)

**Alternatives considered**:

- **Schema-per-tenant**: Better isolation but unmanageable migration complexity beyond ~50 tenants. Overkill for MVP targeting 1,000 users.
- **Database-per-tenant**: Maximum isolation but prohibitive operational cost and connection overhead at scale.
- **MongoDB**: Flexible schema is nice for multi-platform content, but weaker transaction support and no built-in RLS equivalent. PostgreSQL's JSONB columns provide sufficient schema flexibility for platform-specific metadata.

---

## 5. Job Scheduling & Task Queue

**Decision**: BullMQ 5.x + Redis 7

**Rationale**:

- Repeatable Jobs for per-user periodic sync (configurable intervals per platform — FR-014)
- Automatic retry with exponential backoff for failed sync jobs
- Dead-letter queue for jobs that exhaust retries (enables manual investigation)
- Rate limiting to prevent overwhelming platform APIs
- `@nestjs/bullmq` provides seamless NestJS integration with decorators (`@Processor`, `@Process`)
- Bull Board for real-time job monitoring dashboard (observability — Constitution Principle V)
- Redis also serves as a cache layer for API responses and rate limit counters

**Alternatives considered**:

- **node-cron / cron**: No persistence — jobs lost on restart. No distributed locking for multi-instance deployments. No retry logic.
- **Agenda (MongoDB-based)**: Ties scheduling to MongoDB, adding an unnecessary database dependency. BullMQ's Redis-based approach is lighter and faster.
- **AWS SQS + CloudWatch Events**: Cloud-vendor lock-in. Higher latency for job dispatch. More complex local development.

---

## 6. ORM

**Decision**: Drizzle ORM (latest stable)

**Rationale**:

- TypeScript-first with full type inference from schema definitions — no code generation step
- `setLocal` for PostgreSQL session variables enables clean RLS integration
- Schema-as-code: migrations are deterministic and version-controlled
- Lightweight: minimal runtime overhead compared to Prisma or TypeORM
- Supports PostgreSQL-specific features: JSONB, arrays, composite types, RLS policies

**Alternatives considered**:

- **Prisma**: More mature ecosystem, but heavier runtime (Rust query engine binary). Schema language (`.prisma`) is not TypeScript — loses type-sharing advantage in monorepo. RLS integration is more awkward.
- **TypeORM**: Decorator-based, familiar for NestJS developers, but weaker type safety. Known issues with complex query building. Less active maintenance.

---

## 7. AI Digest Pipeline

**Decision**: LangChain.js + OpenAI API (user-configurable provider)

**Rationale**:

- LangChain.js provides abstractions for prompt chaining, output parsing, and model switching
- Users can configure their own API key and preferred provider (OpenAI, Anthropic, self-hosted)
- Map-reduce pattern for digest generation: summarize individual items → group by topic → generate cross-platform trend analysis
- Streaming output via Server-Sent Events for real-time digest rendering in frontend (RSC streaming)

**Alternatives considered**:

- **Direct OpenAI SDK**: Simpler, but lacks abstractions for prompt chaining and model switching. Would need to re-implement output parsing and retry logic.
- **Python microservice (FastAPI + LangChain)**: Better ML ecosystem, but adds operational complexity (separate deployment, inter-service communication). LangChain.js is sufficient for text summarization tasks.

---

## 8. Platform-Specific Feasibility

### GitHub (Server-side, API)

- **API**: REST API v3, free tier 5,000 req/hr with PAT
- **Auth**: Personal Access Token
- **Data**: Starred repos, followed users' activity (events API), releases, issues
- **Risk**: Low — stable, well-documented API

### YouTube (Server-side, API)

- **API**: YouTube Data API v3, 10,000 units/day free quota
- **Auth**: OAuth 2.0
- **Data**: Subscribed channels, new videos (activities API), video metadata
- **Risk**: Low — quota limits require careful management but sufficient for MVP

### X/Twitter (Server-side, rettiwt-api)

- **API**: rettiwt-api (npm), provides access to GraphQL endpoints
- **Auth**: `auth_token` + `ct0` cookies OR API key
- **Data**: Following timeline, user posts, media
- **Risk**: Low/Medium — Avoids official $200/mo cost. Node.js 22 required for rettiwt-api v7.
- **V3 Decision**: Migrated from extension-based to server-side via `rettiwt-api` for better reliability and background sync without requiring the user's browser to be open.

### Xiaohongshu (DEPRECATED/REMOVED)

- **V3 Decision**: Removed XHS support entirely.
- **Rationale**: Extreme anti-scraping complexity (XYW_ signature format, mandatory device ID binding, TLS/JA3 fingerprinting). Node.js ecosystem lacks robust TLS spoofing for XHS, making server-side maintenance unsustainable for MVP. Extension-based approach was also deemed too intrusive for a "zero-footprint" philosophy.

---

## 9. Testing Strategy

| Layer                 | Tool                     | Scope                                                  |
| --------------------- | ------------------------ | ------------------------------------------------------ |
| Unit (backend)        | Vitest                   | Service logic, connector parsing, digest generation    |
| Unit (frontend)       | Vitest + Testing Library | Component rendering, hook behavior                     |
| Integration (backend) | Vitest + Testcontainers  | API endpoints with real PostgreSQL + Redis             |
| E2E (frontend)        | Playwright               | Critical user journeys (signup, connect, feed, digest) |
| Contract (API)        | Vitest                   | Request/response schema validation against contracts   |

---

## 10. Deployment & Infrastructure (MVP)

**Decision**: Docker Compose for local dev; cloud deployment deferred to post-MVP

**Local development stack**:

- PostgreSQL 16 (Docker)
- Redis 7 (Docker)
- NestJS backend (local Node.js)
- Next.js frontend (local Node.js)
- Chrome extension (loaded unpacked in Chrome)

**Production considerations** (post-MVP):

- PgBouncer for connection pooling (Transaction Mode)
- Separate worker process for BullMQ job processing
- CDN for frontend static assets
- Rate limiting middleware for API endpoints
