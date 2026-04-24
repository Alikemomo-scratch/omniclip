/**
 * Platform identifiers — extend this union type when adding new platforms.
 */
export type PlatformId = 'github' | 'youtube' | 'twitter';

/**
 * Content type identifiers across all platforms.
 */
export type ContentType = 'post' | 'video' | 'commit' | 'release' | 'issue' | 'tweet';

/**
 * Connection type — how the platform is connected.
 */
export type ConnectionType = 'api' | 'cookie' | 'extension';

/**
 * Credential type — how the platform authenticates.
 */
export type CredentialType = 'pat' | 'oauth' | 'cookie' | 'api_key';

/**
 * Connection status values.
 */
export type ConnectionStatus = 'active' | 'error' | 'credential_expired' | 'disconnected';

/**
 * Digest type options.
 */
export type DigestType = 'daily' | 'weekly';

/**
 * Digest generation status.
 */
export type DigestStatus = 'pending' | 'generating' | 'completed' | 'failed';

/**
 * Sync job status.
 */
export type SyncJobStatus = 'queued' | 'running' | 'completed' | 'failed';
