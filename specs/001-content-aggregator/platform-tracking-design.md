# Platform Tracking & Filtering Design

**Date**: 2026-03-17
**Goal**: Maximize signal-to-noise ratio. Break the information cocoon by tracking high-value updates from explicitly followed/starred entities, rather than algorithmic feeds or noisy operational events.

---

## 1. Core Paradigm: "Followed Entities Only"

To completely avoid algorithmic manipulation across all platforms, OmniClip operates strictly on the user's explicit social graph (Followings/Subscriptions) and saved entities (Starred Repos). **Algorithmic recommendation feeds (For You, Discover, etc.) are explicitly ignored.**

---

## 2. Platform-Specific Tracking Rules

### GitHub

- **Followed Users & Organizations** (`/users/current/received_events`):
  - **Track**: `CreateEvent` (new repos), `ReleaseEvent` / `PublicEvent` (new releases/open-sourcing), `WatchEvent` (new stars by followed users).
  - **Ignore**: `PushEvent` (commits), `IssuesEvent`, `PullRequestEvent` (noise).
- **Starred Repositories** (`/user/starred` → `/repos/{owner}/{repo}/releases`):
  - **Track**: Periodically fetch these repos for **new Releases/Tags**. The release notes become the content item body.

### YouTube

- **Subscriptions**:
  - **Track**: New videos published by channels the user is subscribed to.
  - **Ignore**: YouTube Home feed, Shorts (optional/filterable), and generic trending videos.

### Twitter / X (via Extension)

- **Followings**:
  - **Track**: Original tweets posted by accounts the user follows (Following Timeline).
  - **Ignore**: "For You" timeline, algorithmic retweets, and replies (unless specifically requested).

### Xiaohongshu / RED (via Extension)

- **Followings**:
  - **Track**: New notes/posts published by creators the user explicitly follows (关注 Tab).
  - **Ignore**: The main "Discover" (发现) feed and search recommendations.

---

## 3. Configurable Per-Platform Sync Intervals

Because content velocity differs wildly between platforms (e.g., GitHub releases are infrequent, while Twitter posts are daily), OmniClip must expose the **Sync Interval** setting to the user on a per-connection basis.

- **Data Model**: The `platform_connections.sync_interval_minutes` field already exists.
- **User Interface**: When adding or editing a connection, the user can set custom intervals.
  - _Example A_: Xiaohongshu → Sync every 1 day (1440 minutes).
  - _Example B_: GitHub → Sync every 1 month (43200 minutes).
  - _Example C_: Twitter → Sync every 6 hours (360 minutes).
- **Scheduler**: The backend BullMQ `SyncScheduler` automatically respects these intervals when creating repeatable jobs for each connection.
