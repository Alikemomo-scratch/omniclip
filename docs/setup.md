# OmniClip Setup Guide (For AI Agents)

This document is written for AI assistants. Follow these steps sequentially. **Do not run blocking commands** (`pnpm dev`, `docker-compose logs -f`, etc.) — they will hang your terminal.

---

## Prerequisites

Verify before proceeding:

- **Node.js 22 LTS** — `node -v` should show v22.x
- **pnpm 9.x** — `pnpm -v` should show 9.x (install: `npm install -g pnpm`)
- **Docker & Docker Compose** — `docker --version` and `docker compose version`

---

## Step 1: Clone & Install

```bash
git clone https://github.com/Alikemomo-scratch/omniclip.git
cd omniclip
pnpm install
pnpm build
```

## Step 2: Start Infrastructure

```bash
docker-compose up -d
```

Wait for PostgreSQL to be ready before proceeding:

```bash
until pg_isready -h localhost -p 5432 2>/dev/null; do sleep 1; done
```

## Step 3: Configure Environment Variables

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

**Ask the user** for their preferred AI API Key (`OPENAI_API_KEY` or `GEMINI_API_KEY`), then inject it into `packages/backend/.env`.

If the user wants YouTube integration, also ask for:
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`

See [Platform Keys Setup Guide](platform-keys-setup.md) for how to obtain each credential.

> Leave `DATABASE_URL`, `REDIS_URL`, and `YOUTUBE_REDIRECT_URI` as their defaults.

## Step 4: Run Database Migrations

```bash
pnpm --filter backend db:migrate
```

## Step 5: Handoff to User

**Do not** run `pnpm dev` — it blocks the terminal.

Instruct the user to run the following in their own terminal:

```bash
pnpm dev
```

Then guide them to:

1. Open `http://localhost:3000`
2. Register an account and log in
3. Go to the **Connections** page
4. Add their platforms:

| Platform | Credential Type | How to Obtain |
|----------|----------------|---------------|
| **GitHub** | Personal Access Token (Classic) | [Guide](platform-keys-setup.md#1-github--personal-access-token-pat) |
| **YouTube** | OAuth popup (automatic) | Requires .env setup in Step 3 — [Guide](platform-keys-setup.md#3-youtube--google-cloud-oauth-20) |
| **Twitter/X** | Cookies (`auth_token` + `ct0`) | [Guide](platform-keys-setup.md#2-twitter--x--浏览器-cookies) |

Each connection supports a configurable **sync interval** (e.g., every 1 hour, every 1 day).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `pnpm build` fails | Missing Node.js 22 | `nvm install 22 && nvm use 22` |
| DB migration fails | PostgreSQL not ready | Re-run `pg_isready` check, then retry |
| Connection shows `unhealthy` | Expired credentials | Re-enter credentials on Connections page |
| AI digest returns empty | Missing API key in `.env` | Add `OPENAI_API_KEY` or `GEMINI_API_KEY` |
