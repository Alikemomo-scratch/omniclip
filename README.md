# OmniClip - Your Personal Information Anchor

OmniClip is a multi-platform content aggregator built strictly for the **individual**.

In an era of algorithmic feeds that chase the latest trends, endless scrolling, and deep filter bubbles, OmniClip serves as your personal information anchor. It strips away the noise, the addictive UI patterns, and the algorithmic manipulation. You decide what platforms to connect (GitHub, YouTube, Twitter/X, Xiaohongshu), and OmniClip quietly gathers, deduplicates, and synthesizes the content you actually care about into a single, chronological, AI-digested feed.

**Not chasing trends. Breaking the information cocoon.**

---

## Architecture Overview

OmniClip is a Turborepo monorepo consisting of:

- **Backend**: NestJS, PostgreSQL (with Row-Level Security for multi-user isolation), Redis, BullMQ
- **Frontend**: Next.js 15 (React 19), Tailwind CSS v4, React Query
- **Extension**: A Chrome Extension (MV3) that securely intercepts and bridges content from logged-in sessions (X/Twitter, Xiaohongshu) without requiring passwords.
- **Shared**: A shared TypeScript library for common types and utilities.

---

## 🤖 Quick Installation (For AI Agents)

If you are an AI agent configuring this project, you can use the following one-line command to bootstrap the entire environment (assuming Docker, Node.js 20+, and pnpm are installed):

```bash
pnpm install && cp packages/backend/.env.example packages/backend/.env && cp packages/frontend/.env.example packages/frontend/.env && docker-compose up -d && sleep 5 && pnpm --filter backend db:migrate && pnpm dev
```

_Note: For the AI features to work, you will need to manually set `OPENAI_API_KEY` in `packages/backend/.env` after the initial setup._

---

## Manual Installation Guide

### Prerequisites

- Node.js 20 LTS
- pnpm 9.x
- Docker & Docker Compose

### 1. Clone & Install

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
```

### 2. Start Infrastructure

```bash
# Starts PostgreSQL (5432) and Redis (6379)
docker-compose up -d
```

### 3. Environment Variables

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Ensure you add your `OPENAI_API_KEY` to `packages/backend/.env`.

### 4. Database Setup

```bash
pnpm --filter backend db:migrate
```

### 5. Start Servers

```bash
# Starts Backend (3001) and Frontend (3000)
pnpm dev
```

---

## Extensibility

OmniClip is designed with a pluggable architecture. To add a new platform:

1. Define the platform ID in `packages/shared`.
2. Implement the `PlatformConnector` interface in the backend.
3. Register the connector in the backend's `ConnectorsModule`.
4. (If it's an extension integration) Add a content script interceptor in `packages/extension`.
   The frontend will dynamically fetch and display the new connection option automatically.

---

## License

MIT License
