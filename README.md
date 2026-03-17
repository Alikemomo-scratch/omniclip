# OmniClip - Your Personal Information Anchor

OmniClip is a multi-platform content aggregator built strictly for the **individual**.

In an era of algorithmic feeds that chase the latest trends, endless scrolling, and deep filter bubbles, OmniClip serves as your personal information anchor. It strips away the noise, the addictive UI patterns, and the algorithmic manipulation. You decide what platforms to connect, and OmniClip quietly gathers, deduplicates, and synthesizes the content you actually care about into a single, chronological, AI-digested feed.

**Not chasing trends. Breaking the information cocoon.**

---

## Supported Platforms

Currently, OmniClip supports gathering content from the following platforms:

- **GitHub** (Starred Repositories / Releases)
- **YouTube** (Subscriptions / New Videos)
- **Twitter / X** (Bookmarks / Timeline via Extension)
- **Xiaohongshu / RED** (Saved Posts via Extension)

---

## 🤖 Quick Installation (For AI Agents)

If you are an AI agent configuring this project, use the following one-line command to bootstrap the entire environment:

```bash
pnpm install && cp packages/backend/.env.example packages/backend/.env && cp packages/frontend/.env.example packages/frontend/.env && docker-compose up -d && sleep 5 && pnpm --filter backend db:migrate && pnpm dev
```

_Note: For the AI features to work, set `OPENAI_API_KEY` in `packages/backend/.env` after the initial setup._

---

## Step-by-Step Setup Guide (For Humans)

Follow these steps to configure and run OmniClip on your local machine.

### Prerequisites

- **Node.js 20 LTS** (`node -v` should show v20.x)
- **pnpm 9.x** (`npm install -g pnpm`)
- **Docker & Docker Compose** (for running PostgreSQL and Redis)
- **Chrome / Chromium browser** (for the OmniClip extension)

### Step 1: Clone the Repository & Install Dependencies

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
```

### Step 2: Start the Database and Redis

OmniClip requires PostgreSQL for data storage and Redis for queues/rate-limiting.

```bash
# Starts PostgreSQL (port 5432) and Redis (port 6379) in the background
docker-compose up -d
```

### Step 3: Configure Environment Variables

Copy the example environment files to create your local configurations.

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

**Required Configuration:**
Open `packages/backend/.env` in your text editor and add your OpenAI API key for the AI Digest feature to work:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

_(Leave the `DATABASE_URL` and `REDIS_URL` as their defaults if you are using the provided `docker-compose.yml`.)_

### Step 4: Initialize the Database

Run the database migrations to create all necessary tables and security policies.

```bash
pnpm --filter backend db:migrate
```

### Step 5: Start the Application Servers

Start the backend and frontend development servers.

```bash
pnpm dev
```

- The **Frontend** will be available at `http://localhost:3000`
- The **Backend API** will be available at `http://localhost:3001`

### Step 6: Install the Chrome Extension

To collect data from Twitter/X and Xiaohongshu without needing API keys, you must install the OmniClip extension.

1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in the top right corner).
3. Click **"Load unpacked"**.
4. Select the `packages/extension/dist/` directory inside the OmniClip project folder.

### Step 7: Connect Your Platforms

1. Open your browser and go to `http://localhost:3000`.
2. Register a new local account and log in.
3. Navigate to the **Connections** page.
4. Add your desired platforms (e.g., provide a GitHub Personal Access Token, or authenticate YouTube via OAuth).
5. For Extension-based platforms (Twitter, Xiaohongshu), simply log into those websites in your browser; the extension will automatically intercept and sync your saved content to your OmniClip feed!

---

## License

MIT License
