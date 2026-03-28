# Quickstart: Local Development Setup

**Feature**: 001-content-aggregator
**Date**: 2026-03-10

---

## Prerequisites

- **Node.js** 20 LTS (`node -v` should show v20.x)
- **pnpm** 9.x (`npm install -g pnpm`)
- **Docker** & **Docker Compose** (for PostgreSQL + Redis)
- **Chrome** / Chromium browser (for extension development)
- **Git** (on branch `001-content-aggregator`)

---

## 1. Clone & Install

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
git checkout 001-content-aggregator

pnpm install
```

---

## 2. Start Infrastructure

```bash
docker-compose up -d
```

This starts:

- **PostgreSQL 16** on `localhost:5432` (user: `postgres`, password: `postgres`, db: `aggregator_dev`)
- **Redis 7** on `localhost:6379`

Verify:

```bash
docker-compose ps
# Both containers should show "Up"
```

---

## 3. Environment Setup

```bash
# Copy example env files
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Edit `packages/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aggregator_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-in-production
OPENAI_API_KEY=sk-your-key-here
```

Edit `packages/frontend/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

---

## 4. Database Setup

```bash
# Run migrations
pnpm --filter backend db:migrate

# (Optional) Seed with test data
pnpm --filter backend db:seed
```

---

## 5. Start Development Servers

```bash
# Start all services in dev mode (via Turborepo)
pnpm dev
```

This starts:

- **Backend** at `http://localhost:3001`
- **Frontend** at `http://localhost:3000`
- **Shared** types in watch mode

Or start individually:

```bash
pnpm --filter backend dev      # Backend only
pnpm --filter frontend dev     # Frontend only
```

---

## 6. Load Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select `packages/extension/dist/` directory

For extension development with hot reload:

```bash
pnpm --filter extension dev
```

After code changes, click the reload button on `chrome://extensions/`.

---

## 7. Run Tests

```bash
# All tests
pnpm test

# By package
pnpm --filter backend test
pnpm --filter frontend test
pnpm --filter extension test

# With coverage
pnpm test:coverage

# E2E tests (requires running dev servers)
pnpm --filter frontend test:e2e
```

---

## 8. Common Development Tasks

### Add a new platform connector

1. Add platform ID to `packages/shared/types/platform.ts`
2. Create connector class in `packages/backend/src/connectors/<platform>/`
3. Implement `PlatformConnector` interface
4. Register in `ConnectorsModule`
5. Add content script in `packages/extension/src/content/<platform>/` (if extension-based)

### Generate a new migration

```bash
pnpm --filter backend db:generate
```

### View BullMQ dashboard

After starting the backend, visit `http://localhost:3001/admin/queues` (dev only).

### Lint & Format

```bash
pnpm lint        # ESLint
pnpm format      # Prettier
pnpm typecheck   # TypeScript compiler check
```

---

## Project Scripts Reference

| Script                              | Description                    |
| ----------------------------------- | ------------------------------ |
| `pnpm dev`                          | Start all services in dev mode |
| `pnpm build`                        | Build all packages             |
| `pnpm test`                         | Run all tests                  |
| `pnpm test:coverage`                | Tests with coverage report     |
| `pnpm lint`                         | Lint all packages              |
| `pnpm format`                       | Format all packages            |
| `pnpm typecheck`                    | Type check all packages        |
| `pnpm --filter backend db:migrate`  | Run database migrations        |
| `pnpm --filter backend db:generate` | Generate new migration         |
| `pnpm --filter backend db:seed`     | Seed database with test data   |
| `pnpm --filter backend db:studio`   | Open Drizzle Studio (DB GUI)   |
