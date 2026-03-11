import type { PlatformId } from '@omniclip/shared';

/**
 * Error codes that platform connectors can throw.
 * The sync module handles these errors uniformly.
 */
export type ConnectorErrorCode =
  | 'AUTH_EXPIRED' // Token/session expired, user action needed
  | 'AUTH_REVOKED' // Token permanently revoked
  | 'RATE_LIMITED' // API rate limit hit, retry after delay
  | 'PLATFORM_ERROR' // Platform returned unexpected error
  | 'PARSE_ERROR' // Response format changed, cannot parse
  | 'NETWORK_ERROR' // Connection timeout or DNS failure
  | 'ACCOUNT_SUSPENDED'; // User's platform account is suspended

/**
 * Typed error class for platform connector failures.
 * All connectors must throw ConnectorError instances (not generic Errors).
 */
export class ConnectorError extends Error {
  constructor(
    public readonly platform: PlatformId,
    public readonly code: ConnectorErrorCode,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}
