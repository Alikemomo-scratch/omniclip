/**
 * T019: Integration test for GitHub connector
 * Tests: fetchContent with mocked GitHub API responses → verify normalized ContentItemInput output.
 *        healthCheck with valid/invalid tokens.
 *
 * Note: This test mocks the GitHub API via vi.stubGlobal('fetch') but tests the
 * connector's real parsing/normalization logic end-to-end.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubConnector } from '../../src/connectors/github/github.connector';
import type { PlatformConnectionData } from '@omniclip/shared';

function createMockConnection(
  overrides: Partial<PlatformConnectionData> = {},
): PlatformConnectionData {
  return {
    id: 'conn-1',
    user_id: 'user-1',
    platform: 'github',
    connection_type: 'api',
    status: 'active',
    auth_data: { personal_access_token: 'ghp_test123' },
    sync_interval_minutes: 60,
    last_sync_at: null,
    ...overrides,
  };
}

describe('GitHub Connector (Integration)', () => {
  let connector: GitHubConnector;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    connector = new GitHubConnector();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('healthCheck', () => {
    it('should return healthy when GitHub API responds 200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ login: 'testuser', name: 'Test User' }),
        headers: new Map([
          ['x-ratelimit-remaining', '4999'],
          ['x-ratelimit-limit', '5000'],
        ]),
      });

      const result = await connector.healthCheck(createMockConnection());

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('requests remaining');
    });

    it('should return unhealthy when GitHub API responds non-200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map([['x-ratelimit-remaining', '0']]),
      });

      const result = await connector.healthCheck(createMockConnection());

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('401');
    });

    it('should throw ConnectorError when no token is configured', async () => {
      await expect(connector.healthCheck(createMockConnection({ auth_data: {} }))).rejects.toThrow(
        'No personal access token',
      );
    });

    it('should throw ConnectorError for null auth_data', async () => {
      await expect(
        connector.healthCheck(createMockConnection({ auth_data: null })),
      ).rejects.toThrow();
    });
  });

  describe('fetchContent', () => {
    it('should fetch starred repos and events, returning normalized content items', async () => {
      // Mock starred repos endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            repo: {
              id: 12345,
              full_name: 'owner/repo',
              description: 'A cool repo',
              html_url: 'https://github.com/owner/repo',
              owner: { login: 'owner', html_url: 'https://github.com/owner' },
              stargazers_count: 100,
              language: 'TypeScript',
              topics: ['web', 'api'],
            },
            starred_at: '2024-01-15T10:00:00Z',
          },
        ],
        headers: new Map([['x-ratelimit-remaining', '4998']]),
      });

      // Mock release endpoint for the starred repo
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 888,
          tag_name: 'v0.9.0',
          name: 'Release v0.9.0',
          body: 'Starred repo release',
          html_url: 'https://github.com/owner/repo/releases/tag/v0.9.0',
          published_at: '2026-03-09T05:00:00Z',
          author: { login: 'owner', html_url: 'https://github.com/owner' },
        }),
        headers: new Map([['x-ratelimit-remaining', '4997']]),
      });

      // Mock events endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'evt-1',
            type: 'ReleaseEvent',
            repo: { name: 'owner/repo' },
            actor: { login: 'releaser', url: 'https://api.github.com/users/releaser' },
            payload: {
              action: 'published',
              release: {
                tag_name: 'v1.0.0',
                name: 'Release 1.0',
                body: 'First release!',
                html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
                published_at: '2024-01-16T12:00:00Z',
              },
            },
            created_at: '2024-01-16T12:00:00Z',
          },
          {
            id: 'evt-2',
            type: 'WatchEvent',
            repo: { name: 'owner/issues-repo' },
            actor: { login: 'issuer', url: 'https://api.github.com/users/issuer' },
            payload: {
              action: 'started',
            },
            created_at: '2024-01-17T08:00:00Z',
          },
        ],
        headers: new Map([['x-ratelimit-remaining', '4996']]),
      });

      const result = await connector.fetchContent(createMockConnection(), null);

      expect(result.items.length).toBeGreaterThanOrEqual(2);

      // Check starred repo item (connector maps starred repos as content_type: 'release' with source: 'starred_repo')
      const starredItem = result.items.find(
        (i) => i.metadata && (i.metadata as Record<string, unknown>).source === 'starred_repo',
      );
      expect(starredItem).toBeDefined();
      expect(starredItem!.external_id).toContain('888');
      expect(starredItem!.content_type).toBe('release');
      expect(starredItem!.original_url).toContain('releases');

      // Check release event item
      const releaseItem = result.items.find((i) => i.external_id === 'github-event-evt-1');
      expect(releaseItem).toBeDefined();
      expect(releaseItem!.content_type).toBe('release');
      expect(releaseItem!.original_url).toContain('releases');

      // Check watch event item
      const watchItem = result.items.find((i) => i.external_id === 'github-event-evt-2');
      expect(watchItem).toBeDefined();
      expect(watchItem!.title).toContain('Starred');
    });

    it('should handle empty responses gracefully', async () => {
      // Empty starred repos
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
        headers: new Map([['x-ratelimit-remaining', '4999']]),
      });

      // Empty events
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
        headers: new Map([['x-ratelimit-remaining', '4998']]),
      });

      const result = await connector.fetchContent(createMockConnection(), null);
      expect(result.items).toHaveLength(0);
    });

    it('should throw RATE_LIMITED error when rate limit is hit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'API rate limit exceeded' }),
        headers: new Map([['x-ratelimit-remaining', '0']]),
      });

      await expect(connector.fetchContent(createMockConnection(), null)).rejects.toThrow();
    });

    it('should throw AUTH_EXPIRED for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Bad credentials' }),
        headers: new Map([['x-ratelimit-remaining', '0']]),
      });

      await expect(connector.fetchContent(createMockConnection(), null)).rejects.toThrow();
    });
  });
});
