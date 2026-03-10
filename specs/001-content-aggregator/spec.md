# Feature Specification: Multi-Platform Content Aggregator

**Feature Branch**: `001-content-aggregator`  
**Created**: 2026-03-09  
**Status**: Draft  
**Input**: User description: "Multi-platform content aggregation SaaS with browser extension + cloud sync architecture. Collects followed content from GitHub, YouTube, X/Twitter, Xiaohongshu, WeChat via local browser extension and server-side APIs, then performs AI-powered analysis and summarization."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Setup & Platform Connection (Priority: P1)

A new user signs up for the platform, installs the browser extension, and connects their first content source. They link their GitHub account via API token and immediately see their starred repositories and followed users' activity aggregated into a unified feed.

**Why this priority**: Without onboarding and at least one working platform connection, no other feature has value. This is the foundation of the entire product.

**Independent Test**: Can be fully tested by creating an account, installing the extension, entering a GitHub Personal Access Token, and verifying that followed repos/users' recent activity appears in the feed within 2 minutes.

**Acceptance Scenarios**:

1. **Given** a new user on the signup page, **When** they complete registration, **Then** they are guided to install the browser extension and connect their first platform.
2. **Given** a user with the extension installed, **When** they provide a valid GitHub Personal Access Token, **Then** their followed users and starred repos are listed within 30 seconds.
3. **Given** a user with a connected GitHub account, **When** they open the main feed, **Then** they see recent activity (commits, releases, issues) from followed repos sorted by recency.
4. **Given** a user provides an invalid or expired token, **When** the system attempts to connect, **Then** a clear error message explains what went wrong and how to fix it.

---

### User Story 2 - Browser Extension Content Collection for Anti-Scraping Platforms (Priority: P1)

A user who follows creators on Xiaohongshu and X/Twitter uses the browser extension to collect content from these platforms. While the user is logged into Xiaohongshu in their browser, the extension periodically reads their followed feed and syncs the content (text, images, metadata) to the cloud. The user does not need to manually export anything — the extension works in the background.

**Why this priority**: This is the core technical differentiator. Platforms like Xiaohongshu and X have aggressive anti-scraping that makes server-side collection impossible. The local extension approach is the only viable path, making it equally critical as Story 1.

**Independent Test**: Can be tested by logging into Xiaohongshu in Chrome, activating the extension's collection for that platform, waiting for one sync cycle, and verifying that followed creators' recent posts appear in the cloud dashboard.

**Acceptance Scenarios**:

1. **Given** a user logged into Xiaohongshu in Chrome with the extension active, **When** a scheduled sync triggers, **Then** the extension reads their followed feed and uploads post content (title, text, images, engagement metrics) to the cloud.
2. **Given** the extension is collecting from X/Twitter, **When** a sync completes, **Then** tweets from followed accounts appear in the user's unified feed with full text, media links, and timestamps.
3. **Given** the user's browser cookie for a platform has expired, **When** a sync attempt fails, **Then** the extension shows a notification asking the user to re-login to that platform.
4. **Given** the extension is running, **When** it encounters a rate-limiting or anti-bot challenge, **Then** it backs off gracefully without triggering account lockout, and notifies the user if manual intervention is needed.
5. **Given** the user has not opened their browser for 48 hours, **When** they next open it, **Then** the extension catches up on missed content from the last available feed state without duplicating previously collected items.

---

### User Story 3 - Server-Side Collection for Open Platforms (Priority: P2)

A user connects YouTube and GitHub through official APIs. The server automatically fetches new videos from subscribed channels and new activity from followed GitHub repos on a schedule, without requiring the browser extension to be running.

**Why this priority**: YouTube and GitHub have stable, free/cheap official APIs. Server-side collection for these platforms provides always-on reliability independent of whether the user's browser is open.

**Independent Test**: Can be tested by connecting a YouTube account via OAuth, closing the browser entirely, waiting for one scheduled sync cycle, and verifying new videos from subscribed channels appear in the feed.

**Acceptance Scenarios**:

1. **Given** a user has connected YouTube via OAuth, **When** the scheduled sync runs, **Then** new videos from subscribed channels appear in the unified feed with title, thumbnail, duration, and publish date.
2. **Given** a user has connected GitHub via API token, **When** the scheduled sync runs, **Then** new releases, issues, and commits from starred/watched repos appear in the feed.
3. **Given** an API rate limit is reached, **When** the system detects the limit, **Then** it queues remaining work for the next available window and notifies the user if content will be delayed.

---

### User Story 4 - AI-Powered Content Analysis & Summarization (Priority: P2)

After content is collected from all connected platforms, the user views an AI-generated daily/weekly digest. The digest groups content by topic, highlights trending themes across platforms, and provides concise summaries so the user doesn't need to read every individual post.

**Why this priority**: AI analysis is the key value-add that differentiates this product from a simple RSS reader. However, it depends on having content collected first (Stories 1-3).

**Independent Test**: Can be tested by having at least 20 collected posts from any platform, triggering a digest generation, and verifying the output contains topic grouping, trend highlights, and per-post summaries.

**Acceptance Scenarios**:

1. **Given** a user has 20+ collected posts from the last 24 hours, **When** they request a daily digest, **Then** the system generates a summary grouped by detected topics with key highlights.
2. **Given** content spans multiple platforms (e.g., GitHub releases + YouTube tech videos + Xiaohongshu posts), **When** a digest is generated, **Then** cross-platform trends are identified (e.g., "3 sources discussed AI coding tools this week").
3. **Given** a user has set their digest preference to "weekly" and "Chinese language", **When** the weekly digest is generated, **Then** it is delivered in Chinese and covers the full week's content.
4. **Given** fewer than 5 posts were collected in a period, **When** a digest is requested, **Then** the system shows individual post summaries instead of forcing topic grouping.

---

### User Story 5 - Multi-User Account & Platform Management (Priority: P3)

Multiple users each have their own accounts with independent platform connections, content feeds, and AI preferences. One user's connected platforms and collected content are completely isolated from another user's data.

**Why this priority**: Multi-user support is essential for a SaaS product, but can be built incrementally after the core single-user flow works.

**Independent Test**: Can be tested by creating two separate user accounts, connecting different platforms to each, and verifying that each user only sees their own content.

**Acceptance Scenarios**:

1. **Given** two registered users A and B, **When** user A connects GitHub and user B connects YouTube, **Then** user A's feed shows only GitHub content and user B's feed shows only YouTube content.
2. **Given** a user is logged in, **When** they view their platform connections page, **Then** they see only their own connections with status indicators (connected/disconnected/error).
3. **Given** a user wants to disconnect a platform, **When** they remove the connection, **Then** the stored credentials are deleted and future syncs for that platform stop.

---

### User Story 6 - Extensible Platform Connector Architecture (Priority: P3)

The system is designed so that adding support for a new platform (e.g., WeChat Official Accounts, Bilibili, Weibo) requires implementing a standardized connector interface without modifying core application logic.

**Why this priority**: Extensibility is a long-term architectural investment. It's important for future growth but doesn't deliver direct user value until new connectors are actually built.

**Independent Test**: Can be tested by verifying that the existing connectors (GitHub, YouTube, Xiaohongshu, X) all implement the same interface, and that a new mock connector can be added and functional without changing any existing code.

**Acceptance Scenarios**:

1. **Given** the connector interface is defined, **When** a developer implements a new platform connector, **Then** they only need to implement the standard interface methods (authenticate, fetch, parse, health-check) without touching core code.
2. **Given** a new connector is registered, **When** a user visits the platform connection page, **Then** the new platform appears as an available option automatically.
3. **Given** a connector encounters a platform-specific error, **When** it fails, **Then** the error is captured and reported through the standard error reporting mechanism without affecting other connectors.

---

### Edge Cases

- What happens when a platform changes its page structure (DOM) that the extension relies on? → The extension detects extraction failures, notifies the user, and continues collecting from other platforms unaffected.
- What happens when a user connects the same platform account from two different devices/browsers? → The system deduplicates content based on unique post identifiers, preventing duplicate entries in the feed.
- What happens when the AI analysis service is unavailable? → Content collection and display continue normally; digest generation is queued and retried when the service recovers. The user sees a notice that analysis is temporarily delayed.
- How does the system handle content in multiple languages? → The AI analysis service processes content in its original language and generates summaries in the user's preferred language.
- What happens when a platform account is banned or suspended? → The extension/API detects the authentication failure, marks the connection as "error", and notifies the user without retrying (to avoid worsening the situation).
- What happens when collected content contains sensitive or NSFW material? → Content is stored as-is (user's own followed content); AI summaries include content warnings when potentially sensitive material is detected.
- What happens if a malicious actor compromises the extension's update channel and pushes a tampered version? → The extension undergoes code review before each Chrome Web Store release; users are encouraged to verify extension permissions after updates. If suspicious permission changes are detected, the extension warns the user before activating.
- What happens if the cloud API endpoint is compromised and an attacker intercepts data in transit? → All extension-to-cloud communication uses HTTPS with certificate pinning. Collected content is encrypted in transit. No authentication credentials (cookies, passwords) are included in sync payloads.
- What happens if a user's browser extension is inspected by a platform's anti-bot system and the extension's content script is detected? → The extension only reads API responses passively (no DOM mutation, no fake clicks, no automated scrolling). This passive read-only approach minimizes detection surface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create accounts and authenticate securely.
- **FR-002**: System MUST provide a browser extension that can read content from platform pages the user is logged into (Xiaohongshu, X/Twitter).
- **FR-003**: Browser extension MUST sync collected content to the cloud service without requiring manual user action.
- **FR-004**: Browser extension MUST operate within normal browsing patterns (request frequency, behavior) to avoid triggering platform anti-bot measures.
- **FR-005**: System MUST support server-side content collection via official APIs for platforms that provide them (GitHub REST API, YouTube Data API).
- **FR-006**: System MUST store user credentials (API tokens, OAuth tokens) encrypted at rest. The system MUST NOT store platform login passwords.
- **FR-007**: System MUST deduplicate collected content across sync cycles using platform-specific unique identifiers.
- **FR-008**: System MUST provide a unified feed view that displays content from all connected platforms in chronological order.
- **FR-009**: System MUST support AI-powered content analysis that generates topic-grouped summaries (daily/weekly digest).
- **FR-010**: System MUST allow users to configure digest frequency (daily, weekly) and preferred summary language.
- **FR-011**: System MUST isolate each user's data (connections, content, preferences) from other users.
- **FR-012**: System MUST provide a standardized connector interface so new platform support can be added without modifying core application logic.
- **FR-013**: System MUST notify users when a platform connection fails (expired cookie, revoked token, account issue) with actionable guidance.
- **FR-014**: System MUST support configurable sync schedules per platform (e.g., every hour, every 6 hours, daily).
- **FR-015**: System MUST allow users to view, search, and filter their collected content by platform, date range, and topic.
- **FR-016**: Browser extension MUST detect when a platform's page structure changes and report extraction failures without crashing.
- **FR-017**: Browser extension MUST NOT read, access, or transmit user login credentials (usernames, passwords, payment passwords) from any platform page.
- **FR-018**: Browser extension MUST NOT read or upload platform cookies, session tokens, or any authentication-bearing data to the cloud service. The extension only transmits extracted content data (text, images, metadata).
- **FR-019**: Browser extension's `host_permissions` in the manifest MUST be strictly limited to the specific platform domains required for content collection (e.g., `xiaohongshu.com`, `x.com`). Wildcard permissions like `<all_urls>` are PROHIBITED.
- **FR-020**: Browser extension MUST NOT inject scripts into login pages, payment pages, or any page containing sensitive form inputs. Content scripts MUST only activate on feed/timeline pages.
- **FR-021**: All data transmitted from the browser extension to the cloud service MUST use HTTPS. The sync payload MUST contain only content data and a user authentication token for the aggregator service itself — never platform credentials.
- **FR-022**: Browser extension MUST operate in a read-only, passive manner — it MUST NOT modify page DOM, simulate user interactions (clicks, scrolls, form submissions), or make additional requests to the platform on behalf of the user.

### Key Entities

- **User**: Registered account holder with authentication credentials, language preference, digest settings, and timezone.
- **Platform Connection**: A link between a User and a specific content platform, containing the connection type (extension-based or API-based), authentication state, sync schedule, and health status.
- **Content Item**: A single piece of collected content (post, video, commit, etc.) with platform-specific metadata, original URL, collected timestamp, and deduplication identifier.
- **Digest**: An AI-generated summary covering a time period, containing topic groupings, trend analysis, and per-item summaries. Linked to a User and a set of Content Items.
- **Connector**: A platform-specific module implementing the standard interface (authenticate, fetch, parse, health-check). Categorized as either "extension-based" (runs in browser) or "server-based" (runs on server).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete account creation and connect their first platform within 5 minutes of starting signup.
- **SC-002**: Content from extension-based platforms (Xiaohongshu, X) appears in the user's feed within 10 minutes of the first sync after connection.
- **SC-003**: Content from API-based platforms (GitHub, YouTube) syncs automatically without the browser being open, with new content appearing within the configured sync interval.
- **SC-004**: AI-generated daily digests are available within 15 minutes of the scheduled generation time.
- **SC-005**: The system supports at least 1,000 concurrent users with independent data isolation, with no user able to access another user's content.
- **SC-006**: Adding a new platform connector requires no changes to core application code — only implementing the connector interface and registering it.
- **SC-007**: 90% of users who install the extension successfully collect content from at least one platform on their first attempt.
- **SC-008**: Content deduplication achieves 99%+ accuracy — fewer than 1 in 100 items appear as duplicates in a user's feed.
- **SC-009**: When a platform connection fails, users receive a notification with clear next steps within 5 minutes of the failure.
- **SC-010**: A security audit of the extension's sync payload confirms zero instances of platform cookies, passwords, or session tokens being transmitted to the cloud.
- **SC-011**: The extension's manifest declares permissions for only the specific platform domains in use — no wildcard or overly broad permissions are present.

## Assumptions

- Users are willing to install a browser extension for platforms that require local collection (Xiaohongshu, X/Twitter).
- Users keep their browser open for reasonable periods (a few hours per day) to allow extension-based sync to occur.
- GitHub Personal Access Tokens and YouTube OAuth consent are acceptable authentication methods for users.
- AI summarization will use a third-party LLM service (e.g., OpenAI API, or user-provided API key for self-hosted models).
- The initial release targets Chrome/Chromium-based browsers for the extension. Firefox/Safari support may follow.
- Content retention follows a default of 90 days, configurable per user.
- The product's primary user base reads Chinese, but the system supports multilingual content and summaries.

## Scope Boundaries

### In Scope (MVP)
- Platform connectors: GitHub (API), YouTube (API), X/Twitter (extension), Xiaohongshu (extension)
- Browser extension for Chrome/Chromium
- Unified content feed with search and filtering
- AI digest generation (daily/weekly)
- Multi-user accounts with data isolation
- Connector plugin architecture

### Out of Scope (Future)
- WeChat Official Accounts connector (requires separate research on WeWe RSS integration or RPA approach)
- Mobile app (native iOS/Android)
- Firefox/Safari browser extensions
- Real-time push notifications
- Social features (sharing digests, collaborative feeds)
- Content archiving / permanent storage beyond retention period
- Bilibili, Weibo, Zhihu connectors (future extensions via connector architecture)
