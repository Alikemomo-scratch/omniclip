/**
 * Supported platform identifiers as a constant array.
 */
export const PLATFORMS = ['github', 'youtube', 'twitter', 'xiaohongshu'] as const;

/**
 * Supported content types.
 */
export const CONTENT_TYPES = ['post', 'video', 'commit', 'release', 'issue', 'tweet'] as const;

/**
 * Default sync interval in minutes.
 */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

/**
 * Maximum items in extension sync buffer.
 */
export const MAX_BUFFER_SIZE = 500;

/**
 * Maximum consecutive sync failures before stopping.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Default content retention in days.
 */
export const DEFAULT_CONTENT_RETENTION_DAYS = 90;

/**
 * API version prefix.
 */
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;
