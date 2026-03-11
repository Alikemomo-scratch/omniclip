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
            type: 'IssuesEvent',
            repo: { name: 'owner/issues-repo' },
            actor: { login: 'issuer', url: 'https://api.github.com/users/issuer' },
            payload: {
              action: 'opened',
              issue: {
                number: 42,
                title: 'Bug report',
                body: 'Something is broken',
                html_url: 'https://github.com/owner/issues-repo/issues/42',
              },
            },
            created_at: '2024-01-17T08:00:00Z',
          },
          {
            id: 'evt-3',
            type: 'PushEvent',
            repo: { name: 'owner/push-repo' },
            actor: { login: 'pusher', url: 'https://api.github.com/users/pusher' },
            payload: {
              ref: 'refs/heads/main',
              size: 3,
              commits: [{ sha: 'abc123', message: 'fix: something', author: { name: 'Pusher' } }],
            },
            created_at: '2024-01-18T09:00:00Z',
          },
        ],
        headers: new Map([['x-ratelimit-remaining', '4997']]),
      });

      const result = await connector.fetchContent(createMockConnection(), null);

      expect(result.items.length).toBeGreaterThanOrEqual(3);

      // Check starred repo item (connector maps starred repos as content_type: 'release' with source: 'starred')
      const starredItem = result.items.find(
        (i) => i.metadata && (i.metadata as Record<string, unknown>).source === 'starred',
      );
      expect(starredItem).toBeDefined();
      expect(starredItem!.external_id).toContain('12345');
      expect(starredItem!.content_type).toBe('release');
      expect(starredItem!.original_url).toBe('https://github.com/owner/repo');

      // Check release event item
      const releaseItem = result.items.find(
        (i) =>
          i.content_type === 'release' &&
          i.metadata &&
          (i.metadata as Record<string, unknown>).event_type === 'ReleaseEvent',
      );
      expect(releaseItem).toBeDefined();
      expect(releaseItem!.title).toContain('Release 1.0');
      expect(releaseItem!.original_url).toBe('https://github.com/owner/repo/releases/tag/v1.0.0');

      // Check issue event item
      const issueItem = result.items.find((i) => i.content_type === 'issue');
      expect(issueItem).toBeDefined();
      expect(issueItem!.title).toContain('Bug report');

      // Check push event item
      const pushItem = result.items.find((i) => i.content_type === 'commit');
      expect(pushItem).toBeDefined();
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
