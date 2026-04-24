import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubConnector } from './github.connector';
import type { PlatformConnectionData } from '@omniclip/shared';
import { ConnectorError } from '../interfaces/connector-error';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeConnection(overrides: Partial<PlatformConnectionData> = {}): PlatformConnectionData {
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

describe('GitHubConnector', () => {
  let connector: GitHubConnector;

  beforeEach(() => {
    connector = new GitHubConnector();
    vi.resetAllMocks();
  });

  it('should have correct platform and type', () => {
    expect(connector.platform).toBe('github');
    expect(connector.type).toBe('api');
  });

  describe('healthCheck', () => {
    it('should return healthy when token is valid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-ratelimit-remaining', '4850'],
          ['x-ratelimit-reset', '1741737600'],
        ]),
        json: async () => ({ login: 'testuser' }),
      });

      const result = await connector.healthCheck(makeConnection());

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('4850');
      expect(result.details?.rate_limit_remaining).toBe(4850);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test123',
          }),
        }),
      );
    });

    it('should return unhealthy when token is invalid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map(),
        json: async () => ({ message: 'Bad credentials' }),
      });

      const result = await connector.healthCheck(makeConnection());

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('401');
    });

    it('should throw ConnectorError when auth_data is missing', async () => {
      const conn = makeConnection({ auth_data: null });

      await expect(connector.healthCheck(conn)).rejects.toThrow(ConnectorError);
      await expect(connector.healthCheck(conn)).rejects.toMatchObject({
        code: 'AUTH_EXPIRED',
        platform: 'github',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await connector.healthCheck(makeConnection());

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Network error');
    });
  });

  describe('fetchContent', () => {
    it('should fetch starred repos and events', async () => {
      // Mock starred repos response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-ratelimit-remaining', '4900'],
          ['link', ''],
        ]),
        json: async () => [
          {
            id: 12345,
            full_name: 'octocat/hello-world',
            html_url: 'https://github.com/octocat/hello-world',
            description: 'A hello world repo',
            owner: {
              login: 'octocat',
              html_url: 'https://github.com/octocat',
            },
            stargazers_count: 100,
            language: 'TypeScript',
            pushed_at: '2026-03-10T06:00:00Z',
            starred_at: '2026-03-10T06:00:00Z',
          },
        ],
      });

      // Mock release response for the starred repo
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['x-ratelimit-remaining', '4899']]),
        json: async () => ({
          id: 888,
          tag_name: 'v0.9.0',
          name: 'Release v0.9.0',
          body: 'Starred repo release',
          html_url: 'https://github.com/octocat/hello-world/releases/tag/v0.9.0',
          published_at: '2026-03-09T05:00:00Z',
          author: { login: 'octocat', html_url: 'https://github.com/octocat' },
        }),
      });

      const result = await connector.fetchContent(makeConnection(), null);

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.has_more).toBe(false);
      expect(result.metadata.api_calls_made).toBeGreaterThanOrEqual(2);

      // Check that starred repo's latest release was parsed
      const starred = result.items.find((i) => i.title?.includes('Release v0.9.0'));
      expect(starred).toBeDefined();
      expect(starred?.title).toContain('octocat/hello-world Release: Release v0.9.0');
    });

    it('should filter by since parameter', async () => {
      const since = new Date('2026-03-09T00:00:00Z');

      // Starred repos — empty (no release calls needed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['x-ratelimit-remaining', '4900']]),
        json: async () => [],
      });

      const result = await connector.fetchContent(makeConnection(), since);

      expect(result.items).toEqual([]);
      expect(result.metadata.api_calls_made).toBe(1);
    });

    it('should throw ConnectorError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map(),
        json: async () => ({ message: 'Bad credentials' }),
      });

      await expect(connector.fetchContent(makeConnection(), null)).rejects.toMatchObject({
        code: 'AUTH_EXPIRED',
        retryable: false,
      });
    });

    it('should throw retryable ConnectorError on 403 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Map([
          ['x-ratelimit-remaining', '0'],
          ['x-ratelimit-reset', '1741737600'],
        ]),
        json: async () => ({ message: 'API rate limit exceeded' }),
      });

      await expect(connector.fetchContent(makeConnection(), null)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
      });
    });

    it('should throw ConnectorError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      await expect(connector.fetchContent(makeConnection(), null)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    });
  });

  describe('parseResponse', () => {
    it('should return empty array (events parsing removed — only starred repos used)', () => {
      const rawData = {
        type: 'events',
        data: [
          {
            id: '123',
            type: 'ReleaseEvent',
            actor: { login: 'octocat', url: 'https://api.github.com/users/octocat' },
            repo: { name: 'octocat/hello-world', url: '' },
            payload: {
              action: 'published',
              release: {
                id: 999, tag_name: 'v2.0.0', name: 'Release v2.0.0',
                body: 'Major update',
                html_url: 'https://github.com/octocat/hello-world/releases/tag/v2.0.0',
                published_at: '2026-03-10T10:00:00Z',
              },
            },
            created_at: '2026-03-10T10:00:00Z',
          },
        ],
      };

      expect(connector.parseResponse(rawData)).toEqual([]);
    });

    it('should return empty array for invalid input', () => {
      expect(connector.parseResponse(null)).toEqual([]);
      expect(connector.parseResponse(undefined)).toEqual([]);
      expect(connector.parseResponse('string')).toEqual([]);
    });
  });
});
