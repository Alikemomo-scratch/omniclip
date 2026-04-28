# OmniClip - Your Personal Information Anchor

OmniClip is a multi-platform content aggregator built strictly for the **individual**.

In an era of algorithmic feeds that chase the latest trends, endless scrolling, and deep filter bubbles, OmniClip serves as your personal information anchor. It strips away the noise, the addictive UI patterns, and the algorithmic manipulation. You decide what platforms to connect, and OmniClip quietly gathers, deduplicates, and synthesizes the content you actually care about into a single, chronological, AI-digested feed.

**Not chasing trends. Breaking the information cocoon.**

### Why the name "OmniClip"?

- **Omni**: Meaning "all" or "universal." It represents the ability to aggregate content from across the vast, fragmented web—gathering from any platform you care about.
- **Clip**: Like a newspaper clipping. It represents the act of cutting out the noise, extracting only the most valuable, high-signal information, and saving it into a clean, readable format.

---

## Supported Platforms & Deep Filtering

OmniClip completely ignores algorithmic recommendations (e.g. "For You" or "Discover" pages) across all platforms.

| Platform | What it tracks | What it ignores |
|----------|---------------|-----------------|
| **GitHub** | Latest releases of your **Starred Repositories** | Commits, issues, algorithmic feed events |
| **YouTube** | Full videos from your **Subscriptions** | `#shorts`, recommended videos |
| **Twitter / X** | Your **"Following"** timeline (accounts you follow only) | Algorithmic injections, promoted content |

---

## Quick Start

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
pnpm build
docker-compose up -d
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
# Edit packages/backend/.env — add your AI API key (see docs below)
pnpm --filter backend db:migrate
pnpm dev
```

Then open `http://localhost:3000`, register an account, and connect your platforms.

### Prerequisites

- **Node.js 22 LTS** (`node -v` should show v22.x)
- **pnpm 9.x** (`npm install -g pnpm`)
- **Docker & Docker Compose** (for PostgreSQL and Redis)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/setup.md) | Full step-by-step installation and configuration |
| [Platform Keys Setup](docs/platform-keys-setup.md) | How to obtain API keys / credentials for each platform |

---

## License

MIT License
