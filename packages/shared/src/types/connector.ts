import type { PlatformId, ConnectionType, ConnectionStatus } from './platform';

/**
 * Health check result returned by the connector.
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  details?: {
    rate_limit_remaining?: number;
    rate_limit_reset?: Date;
    api_version?: string;
  };
}

/**
 * Normalized content item input (before database insertion).
 * Maps to content_items table schema.
 */
export interface ContentItemInput {
  external_id: string;
  content_type: string;
  title: string | null;
  body: string | null;
  media_urls: string[];
  metadata: Record<string, unknown>;
  author_name: string | null;
  author_url: string | null;
  original_url: string;
  published_at: Date;
}

/**
 * Result of a content fetch operation.
 */
export interface FetchResult {
  items: ContentItemInput[];
  /** Whether there are more items available (pagination) */
  has_more: boolean;
  /** Cursor/token for fetching next page (if applicable) */
  next_cursor?: string;
  /** Metadata about the fetch operation */
  metadata: {
    api_calls_made: number;
    rate_limit_remaining?: number;
  };
}

/**
 * Base connector interface. All platform connectors must implement this.
 */
export interface PlatformConnector {
  /** Unique platform identifier */
  readonly platform: PlatformId;

  /** Whether this connector runs server-side or in the extension */
  readonly type: ConnectionType;

  /**
   * Validate that the connection credentials/configuration are valid.
   */
  healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult>;

  /**
   * Fetch new content items from the platform.
   */
  fetchContent(connection: PlatformConnectionData, since: Date | null): Promise<FetchResult>;

  /**
   * Parse a raw platform-specific response into normalized content items.
   */
  parseResponse(rawData: unknown): ContentItemInput[];
}

/**
 * Minimal connection data passed to connectors.
 */
export interface PlatformConnectionData {
  id: string;
  user_id: string;
  platform: PlatformId;
  connection_type: ConnectionType;
  status: ConnectionStatus;
  auth_data: Record<string, unknown> | null;
  sync_interval_minutes: number;
  last_sync_at: Date | null;
}
