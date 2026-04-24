# Platform Connector Interface Contract

**Feature**: 001-content-aggregator
**Date**: 2026-03-10
**Purpose**: Standardized interface that all platform connectors must implement (FR-012)

---

## Overview

The connector interface enables extensibility — adding a new platform requires only implementing this interface and registering the connector, without modifying core application logic.

There is only one connector category in v3:

- **API Connector** (server-side): Runs on the backend, fetches content via official or reverse-engineered platform APIs.

_Note: Extension-based connectors are deprecated as of v3._

Both categories implement the same interface but differ in execution context.

---

## TypeScript Interface

```typescript
/**
 * Base connector interface. All platform connectors must implement this.
 */
interface PlatformConnector {
  /** Unique platform identifier */
  readonly platform: PlatformId;

  /** Whether this connector runs server-side or in the extension (Extension deprecated v3) */
  readonly type: 'api';

  /**
   * Validate that the connection credentials/configuration are valid.
   * For API connectors: verify API token/cookies work.
   *
   * @returns Health check result with status and diagnostic info
   */
  healthCheck(connection: PlatformConnection): Promise<HealthCheckResult>;

  /**
   * Fetch new content items from the platform.
   * Must handle pagination internally.
   * Must return items in a normalized ContentItem format.
   *
   * @param connection - The platform connection with auth data
   * @param since - Only fetch content published after this timestamp
   * @returns Array of normalized content items
   */
  fetchContent(connection: PlatformConnection, since: Date | null): Promise<FetchResult>;

  /**
   * Parse a raw platform-specific response into normalized content items.
   *
   * @param rawData - Raw API response data from the platform
   * @returns Array of normalized content items
   */
  parseResponse(rawData: unknown): ContentItemInput[];
}

/**
 * Platform identifiers.
 */
type PlatformId = 'github' | 'youtube' | 'twitter';

/**
 * Authentication data formats for different platforms.
 */
type AuthData = 
  | { personal_access_token: string } // GitHub
  | { access_token: string, refresh_token: string } // YouTube (OAuth)
  | { api_key?: string, auth_token?: string, ct0?: string }; // Twitter (rettiwt-api)
```

---

## Connector Registration

Connectors are registered via NestJS module pattern:

```typescript
// packages/backend/src/connectors/connector.registry.ts

@Injectable()
export class ConnectorRegistry {
  private connectors = new Map<PlatformId, PlatformConnector>();

  register(connector: PlatformConnector): void {
    this.connectors.set(connector.platform, connector);
  }

  get(platform: PlatformId): PlatformConnector {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new NotFoundException(`No connector registered for platform: ${platform}`);
    }
    return connector;
  }

  listRegistered(): PlatformId[] {
    return Array.from(this.connectors.keys());
  }
}
```

### Adding a New Connector (e.g., Bilibili)

1. Add `'bilibili'` to `PlatformId` union type in `shared/types`
2. Create `packages/backend/src/connectors/bilibili/bilibili.connector.ts`
3. Implement `PlatformConnector` interface
4. Register in `ConnectorsModule`:

```typescript
@Module({
  providers: [
    GitHubConnector,
    YouTubeConnector,
    BilibiliConnector, // ← Add new connector here
  ],
})
export class ConnectorsModule implements OnModuleInit {
  onModuleInit() {
    this.registry.register(this.github);
    this.registry.register(this.youtube);
    this.registry.register(this.bilibili); // ← Register it
  }
}
```

No changes to core application logic (sync module, content module, feed, digests) are required.

---

## Error Handling Contract

All connectors must throw typed errors:

```typescript
class ConnectorError extends Error {
  constructor(
    public readonly platform: PlatformId,
    public readonly code: ConnectorErrorCode,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
  }
}

type ConnectorErrorCode =
  | 'AUTH_EXPIRED' // Token/session expired, user action needed
  | 'AUTH_REVOKED' // Token permanently revoked
  | 'RATE_LIMITED' // API rate limit hit, retry after delay
  | 'PLATFORM_ERROR' // Platform returned unexpected error
  | 'PARSE_ERROR' // Response format changed, cannot parse
  | 'NETWORK_ERROR' // Connection timeout or DNS failure
  | 'ACCOUNT_SUSPENDED'; // User's platform account is suspended
```

The sync module handles these errors uniformly:

- `AUTH_EXPIRED` → mark connection as 'credential_expired', notify user
- `AUTH_REVOKED` → mark connection as 'credential_expired', notify user
- `RATE_LIMITED` → re-queue job with delay (exponential backoff with jitter)
- `PARSE_ERROR` → log detailed error for debugging, notify user (FR-016)
- `ACCOUNT_SUSPENDED` → mark connection as 'error', do NOT retry (Edge Case #5)

### Twitter Sync Constraints
- **Minimum Interval**: 30 minutes
- **Jitter**: ±20% added to schedule to avoid pattern detection
- **Auth Strategy**: rettiwt-api with session cookies or API key
