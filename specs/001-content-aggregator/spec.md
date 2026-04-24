# Feature Specification: Multi-Platform Content Aggregator

**Feature Branch**: `001-content-aggregator`
**Created**: 2026-03-09
**Revised**: 2026-04-21
**Status**: Draft (v3 — server-side architecture, 3 platforms)
**Input**: Multi-platform content aggregation SaaS. Collects followed content from GitHub, YouTube, and X/Twitter via server-side APIs and platform-specific scraping libraries, then performs AI-powered analysis and summarization.

**v3 Change Summary**: Removed Xiaohongshu (XHS) from scope. XHS's anti-scraping measures (signature detection, captcha triggers) make reliable server-side scraping infeasible with current open-source tools. The product now focuses on three platforms: GitHub, YouTube, and X/Twitter. XHS may be revisited in the future if a viable scraping approach emerges.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — First-Time Setup & Platform Connection (Priority: P1)

A new user signs up, navigates to the Connections page, and connects their first content source. They paste a GitHub Personal Access Token and immediately see their starred repositories and followed users' activity aggregated into a unified feed.

**Why this priority**: Without onboarding and at least one working platform connection, no other feature has value. This is the foundation of the entire product.

**Independent Test**: Create an account, enter a GitHub PAT on the Connections page, and verify that followed repos/users' recent activity appears in the feed within 2 minutes.

**Acceptance Scenarios**:

1. **Given** a new user on the signup page, **When** they complete registration, **Then** they are guided to the Connections page to add their first platform.
2. **Given** a user on the Connections page, **When** they provide a valid GitHub Personal Access Token, **Then** their followed users and starred repos are listed within 30 seconds.
3. **Given** a user with a connected GitHub account, **When** they open the main feed, **Then** they see recent activity (releases, new repos, star events) from followed users sorted by recency.
4. **Given** a user provides an invalid or expired token, **When** the system attempts to connect, **Then** a clear error message explains what went wrong and how to fix it.

---

### User Story 2 — Cookie-Based Connection for X/Twitter (Priority: P1)

A user who follows creators on X/Twitter connects the platform by providing authentication cookies extracted from their browser. The user opens DevTools, copies the required cookie values, and pastes them into the OmniClip Connections page. The server then automatically fetches their followed feed on a configurable schedule — the user's browser does not need to be open.

**Why this priority**: X/Twitter has no public API for reading a user's followed feed for free. Server-side scraping with user-provided cookies (via rettiwt-api) is the only viable path for automated collection.

**Independent Test**: Log into X/Twitter in a browser, extract the `auth_token` and `ct0` cookies (or use the X Auth Helper extension to generate an API key), paste them into the OmniClip Connections page, wait for one sync cycle, and verify that followed creators' recent tweets appear in the feed — with the browser closed.

**Acceptance Scenarios**:

1. **Given** a user on the Connections page selects X/Twitter, **When** the setup dialog appears, **Then** it displays step-by-step instructions showing how to extract cookies from browser DevTools or use the X Auth Helper extension.
2. **Given** a user provides valid X/Twitter credentials (`auth_token` + `ct0`, or an API key from X Auth Helper), **When** the system validates them, **Then** the connection status shows "Active" and the first sync begins within 60 seconds.
3. **Given** a connected Twitter account, **When** the scheduled sync runs, **Then** new content from the user's Following timeline appears in the unified feed with text, media, engagement metrics, and timestamps.
4. **Given** a user's Twitter cookie has expired, **When** the next sync attempt fails, **Then** the system marks the connection as "Credential Expired", stops further sync attempts, and notifies the user with instructions to provide fresh cookies.
5. **Given** the server encounters a rate-limit or anti-bot challenge from Twitter, **When** the sync job detects it, **Then** it applies exponential backoff with random jitter without triggering account lockout, and notifies the user only if manual intervention is needed.

---

### User Story 3 — Server-Side Collection for Open Platforms (Priority: P2)

A user connects YouTube and GitHub through official APIs. The server automatically fetches new videos from subscribed channels and new activity from followed GitHub repos on a schedule.

**Why this priority**: YouTube and GitHub have stable, free/cheap official APIs. Server-side collection for these platforms provides always-on reliability.

**Independent Test**: Connect a YouTube account via OAuth, wait for one scheduled sync cycle, and verify new videos from subscribed channels appear in the feed.

**Acceptance Scenarios**:

1. **Given** a user has connected YouTube via OAuth, **When** the scheduled sync runs, **Then** new videos from subscribed channels appear in the unified feed with title, thumbnail, duration, and publish date.
2. **Given** a user has connected GitHub via API token, **When** the scheduled sync runs, **Then** new releases and repo creation events from followed users, plus releases of starred repos, appear in the feed.
3. **Given** an API rate limit is reached, **When** the system detects the limit, **Then** it queues remaining work for the next available window and notifies the user if content will be delayed.

---

### User Story 4 — AI-Powered Content Analysis & Summarization (Priority: P2)

After content is collected from all connected platforms, the user views an AI-generated daily/weekly digest. The digest groups content by topic, highlights trending themes across platforms, and provides concise summaries so the user doesn't need to read every individual post.

**Why this priority**: AI analysis is the key value-add that differentiates this product from a simple RSS reader. However, it depends on having content collected first (Stories 1–3).

**Independent Test**: Have at least 20 collected posts from any platform, trigger a digest generation, and verify the output contains topic grouping, trend highlights, and per-post summaries.

**Acceptance Scenarios**:

1. **Given** a user has 20+ collected posts from the last 24 hours, **When** they request a daily digest, **Then** the system generates a summary grouped by detected topics with key highlights.
2. **Given** content spans multiple platforms (e.g., GitHub releases + YouTube tech videos + Twitter threads), **When** a digest is generated, **Then** cross-platform trends are identified (e.g., "3 sources discussed AI coding tools this week").
3. **Given** a user has set their digest preference to "weekly" and "Chinese language", **When** the weekly digest is generated, **Then** it is delivered in Chinese and covers the full week's content.
4. **Given** fewer than 5 posts were collected in a period, **When** a digest is requested, **Then** the system shows individual post summaries instead of forcing topic grouping.

---

### User Story 5 — Multi-User Account & Platform Management (Priority: P3)

Multiple users each have their own accounts with independent platform connections, content feeds, and AI preferences. One user's connected platforms and collected content are completely isolated from another user's data.

**Why this priority**: Multi-user support is essential for a SaaS product, but can be built incrementally after the core single-user flow works.

**Independent Test**: Create two separate user accounts, connect different platforms to each, and verify that each user only sees their own content.

**Acceptance Scenarios**:

1. **Given** two registered users A and B, **When** user A connects GitHub and user B connects YouTube, **Then** user A's feed shows only GitHub content and user B's feed shows only YouTube content.
2. **Given** a user is logged in, **When** they view their platform connections page, **Then** they see only their own connections with status indicators (active/credential expired/error).
3. **Given** a user wants to disconnect a platform, **When** they remove the connection, **Then** the stored credentials are permanently deleted from the database and future syncs for that platform stop.

---

### User Story 6 — Extensible Platform Connector Architecture (Priority: P3)

The system is designed so that adding support for a new platform (e.g., Bilibili, Weibo, Xiaohongshu, WeChat Official Accounts) requires implementing a standardized connector interface without modifying core application logic.

**Why this priority**: Extensibility is a long-term architectural investment. It's important for future growth but doesn't deliver direct user value until new connectors are actually built.

**Independent Test**: Verify that the existing connectors (GitHub, YouTube, X/Twitter) all implement the same interface, and that a new mock connector can be added and functional without changing any existing code.

**Acceptance Scenarios**:

1. **Given** the connector interface is defined, **When** a developer implements a new platform connector, **Then** they only need to implement the standard interface methods (validate credentials, fetch content, parse response, health-check) without touching core code.
2. **Given** a new connector is registered, **When** a user visits the platform connection page, **Then** the new platform appears as an available option automatically.
3. **Given** a connector encounters a platform-specific error, **When** it fails, **Then** the error is captured and reported through the standard error reporting mechanism without affecting other connectors.

---

### Edge Cases

- What happens when a user connects the same platform account from two different OmniClip accounts? → The system deduplicates content based on unique post identifiers per user. Two users following the same creator will each have their own copy of the content.
- What happens when the AI analysis service is unavailable? → Content collection and display continue normally; digest generation is queued and retried when the service recovers. The user sees a notice that analysis is temporarily delayed.
- How does the system handle content in multiple languages? → The AI analysis service processes content in its original language and generates summaries in the user's preferred language.
- What happens when a platform account is banned or suspended? → The server detects the authentication failure, marks the connection as "error", and notifies the user without retrying (to avoid worsening the situation).
- What happens when collected content contains sensitive or NSFW material? → Content is stored as-is (user's own followed content); AI summaries include content warnings when potentially sensitive material is detected.
- What happens if a user provides someone else's cookies? → The system has no way to verify cookie ownership. This is a terms-of-service matter, not a technical control. The system only uses cookies to fetch the feed associated with that session.
- What happens if the server's IP gets blocked by Twitter? → The system detects connection failures, applies exponential backoff, and notifies the operator. For scale deployments, proxy rotation (residential proxies) is recommended but not required for MVP.
- What happens when a platform changes its API response schema? → The parser detects unexpected structures, logs detailed errors for debugging, marks affected items as unparseable, and continues processing remaining items. The user is notified of degraded collection.

## Requirements _(mandatory)_

### Functional Requirements

#### Core

- **FR-001**: System MUST allow users to create accounts and authenticate securely.
- **FR-002**: System MUST support server-side content collection for three platforms: GitHub (REST API + PAT), YouTube (Data API + OAuth), X/Twitter (GraphQL API + cookie via rettiwt-api).
- **FR-003**: System MUST provide a web-based Connections page where users can add, view, validate, and remove platform connections.
- **FR-004**: System MUST store all user credentials (API tokens, OAuth tokens, platform cookies) encrypted at rest using AES-256. The system MUST NOT store platform login passwords.
- **FR-005**: System MUST deduplicate collected content across sync cycles using platform-specific unique identifiers (`platform_id` + `external_id` composite key).
- **FR-006**: System MUST provide a unified feed view that displays content from all connected platforms in chronological order.
- **FR-007**: System MUST support AI-powered content analysis that generates topic-grouped summaries (daily/weekly digest).
- **FR-008**: System MUST allow users to configure digest frequency (daily, weekly) and preferred summary language.
- **FR-009**: System MUST isolate each user's data (connections, content, preferences) from other users via Row-Level Security.
- **FR-010**: System MUST provide a standardized connector interface so new platform support can be added without modifying core application logic.
- **FR-011**: System MUST notify users when a platform connection fails (expired cookie, revoked token, account issue) with actionable guidance on how to fix it.
- **FR-012**: System MUST support configurable sync schedules per platform (e.g., every 1 hour, every 6 hours, daily).
- **FR-013**: System MUST allow users to view, search, and filter their collected content by platform, date range, and topic.

#### Cookie-Based Platform Connection (X/Twitter)

- **FR-014**: The Connections page MUST display step-by-step instructions showing users how to extract the required cookies from browser DevTools (auth_token + ct0) or use the X Auth Helper browser extension to generate an API key.
- **FR-015**: System MUST validate user-provided cookies immediately upon submission by making a lightweight test request (verify_credentials). Invalid cookies MUST be rejected with a clear error message before saving.
- **FR-016**: System MUST detect cookie expiration during scheduled sync and automatically mark the connection as "Credential Expired", stop further sync attempts for that connection, and notify the user.
- **FR-017**: For X/Twitter, the server MUST use the rettiwt-api library to authenticate and fetch the user's Following timeline via GraphQL API requests.
- **FR-018**: All server-side scraping MUST implement exponential backoff with random jitter (base delay × 2^errorCount, capped at 1 hour, ±20% jitter) when encountering rate limits or anti-bot responses (Error 226).
- **FR-019**: The system MUST enforce a per-platform minimum sync interval to prevent aggressive scraping: X/Twitter ≥ 30 minutes. Users MUST NOT be able to configure intervals below this minimum.

#### Credential Security

- **FR-020**: Platform cookies MUST be encrypted before database storage using AES-256 with a server-managed encryption key. The encryption key MUST NOT be stored in the same database as the encrypted cookies.
- **FR-021**: When a user disconnects a platform, the system MUST permanently delete the associated credentials from the database (hard delete, not soft delete).
- **FR-022**: The Connections page MUST clearly inform the user what data they are providing (e.g., "Your X/Twitter session cookies") and that it will be stored encrypted on the server.
- **FR-023**: The system MUST NOT use platform cookies for any purpose other than fetching the user's followed feed content. The system MUST NOT perform writes (likes, follows, posts, comments) on any platform on behalf of the user.

### Key Entities

- **User**: Registered account holder with authentication credentials, language preference, digest settings, and timezone.
- **Platform Connection**: A link between a User and a specific content platform, containing the credential type (PAT, OAuth, cookie/API key), encrypted credentials, connection status (active/credential_expired/error/disabled), sync schedule, and last sync timestamp.
- **Content Item**: A single piece of collected content (post, video, release, tweet, etc.) with platform-specific metadata, original URL, collected timestamp, and deduplication identifier.
- **Digest**: An AI-generated summary covering a time period, containing topic groupings, trend analysis, and per-item summaries. Linked to a User and a set of Content Items.
- **Connector**: A platform-specific module implementing the standard interface (validate credentials, fetch content, parse response, health-check). All connectors run server-side.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can complete account creation and connect their first platform within 5 minutes of starting signup.
- **SC-002**: Content from all three platforms (GitHub, YouTube, Twitter) syncs automatically on schedule without any user action beyond initial credential setup.
- **SC-003**: New content appears in the user's feed within the configured sync interval (default: 1 hour).
- **SC-004**: AI-generated daily digests are available within 15 minutes of the scheduled generation time.
- **SC-005**: The system supports at least 1,000 concurrent users with independent data isolation, with no user able to access another user's content or credentials.
- **SC-006**: Adding a new platform connector requires no changes to core application code — only implementing the connector interface and registering it.
- **SC-007**: 80% of users who attempt to connect X/Twitter successfully provide valid cookies on their first attempt (measured by validation pass rate).
- **SC-008**: Content deduplication achieves 99%+ accuracy — fewer than 1 in 100 items appear as duplicates in a user's feed.
- **SC-009**: When a platform connection fails, users receive a notification with clear next steps within 5 minutes of the failure.
- **SC-010**: A security audit confirms all stored platform credentials are AES-256 encrypted and no credentials appear in application logs, error messages, or API responses.

## Assumptions

- Users are willing to extract cookies from browser DevTools for X/Twitter, or use the X Auth Helper extension. The setup flow provides clear, visual instructions.
- Users understand that Twitter cookies expire on logout and will need to be refreshed periodically (typically valid 30–90 days if user stays logged in).
- GitHub Personal Access Tokens and YouTube OAuth consent are acceptable authentication methods for users.
- AI summarization will use a third-party LLM service (e.g., OpenAI API, or user-provided API key for self-hosted models).
- The rettiwt-api npm package (or equivalent) will continue to work for X/Twitter GraphQL API access. Twitter frequently changes its GraphQL schema; the library must handle this.
- For MVP scale (≤1,000 users), the server's own IP is sufficient for scraping. Proxy rotation is deferred to post-MVP scaling.
- Content retention follows a default of 90 days, configurable per user.
- The product's primary user base reads Chinese, but the system supports multilingual content and summaries.

## Scope Boundaries

### In Scope (MVP)

- Platform connectors: GitHub (REST API), YouTube (Data API), X/Twitter (GraphQL + cookies via rettiwt-api)
- All connectors run server-side — no browser extension
- Web dashboard (frontend) for account management, connections, feed, and digests
- Unified content feed with search and filtering
- AI digest generation (daily/weekly)
- Multi-user accounts with data isolation
- Connector plugin architecture
- Cookie validation and expiration detection with user notification

### Out of Scope (Future)

- Xiaohongshu connector (anti-scraping measures make server-side scraping infeasible with current tools; revisit if viable approach emerges)
- Browser extension for real-time content interception or cookie extraction assistance
- WeChat Official Accounts connector (requires separate research on WeWe RSS integration or RPA approach)
- Mobile app (native iOS/Android)
- Real-time push notifications (email/webhook for credential expiration is in scope)
- Social features (sharing digests, collaborative feeds)
- Content archiving / permanent storage beyond retention period
- Bilibili, Weibo, Zhihu connectors (future extensions via connector architecture)
- Proxy rotation infrastructure for large-scale scraping (post-MVP)
- Automated cookie refresh (requires browser automation, deferred)

## Platform-Specific Technical Notes

_These notes document known technical constraints for each platform. They inform implementation but are not formal requirements._

### X / Twitter

- **API Style**: GraphQL (undocumented, reverse-engineered)
- **Feed Endpoint**: `https://x.com/i/api/graphql/` — `HomeTimeline` query
- **Required Cookies**: `auth_token` (session, 56+ chars) + `ct0` (CSRF, 32+ chars)
- **Signing Library**: None required — cookie-based authentication only
- **Scraping Library**: `rettiwt-api` (npm) — TypeScript, supports guest + authenticated mode
- **API Key Format**: Base64-encoded JSON array of cookie jar entries `[{name, value, domain, path}, ...]`
- **Known Anti-Scraping**: Cloudflare Turnstile, Error 226 (behavioral ML detection), datacenter IP blocking, silent session invalidation
- **Cookie Lifespan**: Expires on logout; no fixed TTL. Typically valid 30–90 days if user stays logged in.
- **Validation Endpoint**: `api.x.com/1.1/account/verify_credentials.json`
- **POC Verified**: rettiwt-api v7 successfully fetches Following timeline (101 tweets per page) with cursor-based pagination. Tested 2026-04-21.

### GitHub

- **API Style**: REST (documented, official)
- **Auth**: Personal Access Token (PAT) — no scopes needed for public data
- **Key Endpoints**: `/users/{user}/received_events`, `/repos/{owner}/{repo}/releases`, `/user/starred`
- **Rate Limit**: 5,000 requests/hour with PAT
- **Library**: Native fetch or octokit

### YouTube

- **API Style**: REST (documented, official)
- **Auth**: OAuth 2.0 (YouTube Data API v3)
- **Key Endpoints**: `subscriptions.list`, `search.list`, `videos.list`
- **Quota**: 10,000 units/day (default); each search costs 100 units
- **Library**: googleapis npm package
