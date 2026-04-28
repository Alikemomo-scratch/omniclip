# OmniClip Setup Guide

Full step-by-step instructions for setting up OmniClip on your local machine.

---

## Prerequisites

- **Node.js 22 LTS** (`node -v` should show v22.x)
- **pnpm 9.x** (`npm install -g pnpm`)
- **Docker & Docker Compose** (for running PostgreSQL and Redis)

---

## Step 1: Clone the Repository & Build

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
pnpm build
```

## Step 2: Start the Database and Redis

OmniClip requires PostgreSQL for data storage and Redis for queues/rate-limiting.

```bash
docker-compose up -d
```

This starts PostgreSQL (port 5432) and Redis (port 6379) in the background.

## Step 3: Configure Environment Variables

Copy the example environment files:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Open `packages/backend/.env` and configure the following:

### AI API Key (Required)

Add your OpenAI or Gemini API key for the AI Digest feature:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
# OR
GEMINI_API_KEY=your-gemini-api-key-here
```

> If both keys are set, OpenAI takes priority.

### YouTube OAuth (Optional)

Required only if you plan to connect YouTube. You'll need a Google Cloud Project with the YouTube Data API v3 enabled:

```env
YOUTUBE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-google-client-secret
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/v1/auth/youtube/callback
```

> For detailed step-by-step instructions on obtaining each key, see the **[Platform Keys Setup Guide](platform-keys-setup.md)**.

Leave `DATABASE_URL` and `REDIS_URL` as their defaults if you are using the provided `docker-compose.yml`.

## Step 4: Initialize the Database

Run the database migrations to create all necessary tables:

```bash
pnpm --filter backend db:migrate
```

## Step 5: Start the Application

```bash
pnpm dev
```

- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:3001`

## Step 6: Connect Your Platforms

1. Open `http://localhost:3000` in your browser.
2. Register a new account and log in.
3. Navigate to the **Connections** page.
4. Add your platforms:

| Platform | Credential Type | Where to Configure |
|----------|----------------|--------------------|
| **GitHub** | Personal Access Token (Classic) | Connections page in OmniClip |
| **YouTube** | OAuth (browser popup) | Connections page (requires .env setup first) |
| **Twitter/X** | Cookies (`auth_token` + `ct0`) | Connections page in OmniClip |

For detailed instructions on obtaining each credential, see the **[Platform Keys Setup Guide](platform-keys-setup.md)**.

Each connection can be configured with a custom **sync interval** (e.g., every 1 hour, every 1 day).

---

## Instructions for AI Agents

If you are an AI assistant tasked with helping the user set up this project, **do not run a single blocking command**. Follow these steps:

1. **Clone:** Clone the repository and `cd` into it if not already there.
2. **Dependencies:** Run `pnpm install`.
3. **Build:** Run `pnpm build` to compile the frontend, backend, and shared packages.
4. **Environment Files:** Copy `.env.example` to `.env` in both `packages/backend` and `packages/frontend`.
5. **API Key:** Ask the user for their preferred AI API Key (`OPENAI_API_KEY` or `GEMINI_API_KEY`). Once provided, inject it into `packages/backend/.env`.
6. **Infrastructure:** Run `docker-compose up -d` to start PostgreSQL and Redis. Use `pg_isready` or retry logic to ensure the database is accepting connections.
7. **Database Migration:** Once the DB is ready, run `pnpm --filter backend db:migrate`.
8. **Handoff to User:** Do **not** run `pnpm dev` yourself as it will block your terminal. Instruct the user to run it in their own terminal, then guide them to Step 6 above.
