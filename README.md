# OmniClip - Your Personal Information Anchor

OmniClip is a multi-platform content aggregator built strictly for the **individual**.

In an era of algorithmic feeds that chase the latest trends, endless scrolling, and deep filter bubbles, OmniClip serves as your personal information anchor. It strips away the noise, the addictive UI patterns, and the algorithmic manipulation. You decide what platforms to connect, and OmniClip quietly gathers, deduplicates, and synthesizes the content you actually care about into a single, chronological, AI-digested feed.

**Not chasing trends. Breaking the information cocoon.**

### Why the name "OmniClip"?

- **Omni**: Meaning "all" or "universal." It represents the ability to aggregate content from across the vast, fragmented web—gathering from any platform you care about.
- **Clip**: Like a newspaper clipping. It represents the act of cutting out the noise, extracting only the most valuable, high-signal information, and saving it into a clean, readable format.

---

## Supported Platforms & Deep Filtering

Currently, OmniClip supports gathering content from the following platforms. To guarantee high-signal information, **OmniClip completely ignores algorithmic recommendations (e.g. "For You" or "Discover" pages) across all platforms**.

- **GitHub**: Tracks `Releases`, `CreateEvent` (open-sourcing), and `WatchEvent` from your followed developers. It also actively fetches the latest releases of your **Starred Repositories**. (All noisy commits and issue tracking are ignored).
- **YouTube**: Tracks full videos from your **Subscriptions**. (Noisy `#shorts` are automatically filtered out).
- **Twitter / X**: Intercepts only your **"Following"** timeline via the extension.
- **Xiaohongshu / RED**: Intercepts only your **"Follow"** feed via the extension.

_Note: You can configure custom sync intervals (e.g., 1 hour, 1 day, 1 month) for each platform independently based on its content velocity._

---

## 🤖 Instructions for AI Agents

If you are an AI assistant tasked with helping the user set up this project, **do not run a single blocking command**. Instead, follow these sequential steps to ensure a robust setup:

2. **Clone:** Clone the repository and `cd` into it if not already there.
3. **Dependencies:** Run `pnpm install`.
4. **Build:** Run `pnpm build` to compile the frontend, backend, and the Chrome extension.
5. **Environment Files:** Copy `.env.example` to `.env` in both `packages/backend` and `packages/frontend`.
6. **API Key:** Ask the user for their preferred AI API Key (`OPENAI_API_KEY` or `GEMINI_API_KEY`). Once provided, inject it into `packages/backend/.env`.
7. **Infrastructure:** Run `docker-compose up -d` to start PostgreSQL and Redis. Use a command (like `pg_isready` or retry logic) to ensure the database is actually accepting connections rather than just sleeping.
8. **Database Migration:** Once the DB is ready, run `pnpm --filter backend db:migrate`.
9. **Handoff to User:** Do **not** run `pnpm dev` yourself as it will block your terminal. Instead, instruct the user to run `pnpm dev` in their own terminal, and guide them to **Step 6 & 7** below so they can install the Chrome extension and authenticate their platforms.

---

## Step-by-Step Setup Guide (For Humans)

Follow these steps to configure and run OmniClip on your local machine.

### Prerequisites

- **Node.js 20 LTS** (`node -v` should show v20.x)
- **pnpm 9.x** (`npm install -g pnpm`)
- **Docker & Docker Compose** (for running PostgreSQL and Redis)
- **Chrome / Chromium browser** (for the OmniClip extension)

### Step 1: Clone the Repository & Build (Agent can do this)

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
pnpm build
```

### Step 2: Start the Database and Redis (Agent can do this)

OmniClip requires PostgreSQL for data storage and Redis for queues/rate-limiting.

```bash
# Starts PostgreSQL (port 5432) and Redis (port 6379) in the background
docker-compose up -d
```

### Step 3: Configure Environment Variables (Requires Human Input)

Copy the example environment files to create your local configurations.

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

**Required Configuration:**
Open `packages/backend/.env` in your text editor and add your OpenAI or Gemini API key for the AI Digest feature to work:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
# OR
GEMINI_API_KEY=your-gemini-api-key-here
```

_(Leave the `DATABASE_URL` and `REDIS_URL` as their defaults if you are using the provided `docker-compose.yml`.)_

### Step 4: Initialize the Database (Agent can do this)

Run the database migrations to create all necessary tables and security policies.

```bash
pnpm --filter backend db:migrate
```

### Step 5: Start the Application Servers (Requires Human Action)

Start the backend and frontend development servers. **(Agents: Do not run this, it will block your terminal!)**

```bash
pnpm dev
```

- The **Frontend** will be available at `http://localhost:3000`
- The **Backend API** will be available at `http://localhost:3001`

### Step 6: Install the Chrome Extension (Requires Human Action)

To collect data from Twitter/X and Xiaohongshu without needing API keys, you must install the OmniClip extension.

1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in the top right corner).
3. Click **"Load unpacked"**.
4. Select the `packages/extension/dist/` directory inside the OmniClip project folder.

### Step 7: Connect Your Platforms (Requires Human Action)

1. Open your browser and go to `http://localhost:3000`.
2. Register a new local account and log in.
3. Navigate to the **Connections** page.
4. Add your desired platforms (e.g., provide a GitHub Personal Access Token, or authenticate YouTube via OAuth).
   - **Configure Sync Interval:** During connection setup, you can select how often OmniClip should sync data from this platform (e.g., Every 1 hour, Every 1 day, Every 1 month).
5. For Extension-based platforms (Twitter, Xiaohongshu), simply log into those websites in your browser; the extension will automatically intercept and sync your saved content to your OmniClip feed!

---

## License

MIT License
