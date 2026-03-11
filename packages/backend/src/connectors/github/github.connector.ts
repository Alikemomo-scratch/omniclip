import { Injectable, Logger } from '@nestjs/common';
import type {
  PlatformConnector,
  PlatformConnectionData,
  HealthCheckResult,
  FetchResult,
  ContentItemInput,
} from '@omniclip/shared';
import { ConnectorError } from '../interfaces/connector-error';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * GitHub connector — fetches starred repos and user events via the GitHub API.
 * Implements PlatformConnector interface for server-side (API) collection.
 */
@Injectable()
export class GitHubConnector implements PlatformConnector {
  private readonly logger = new Logger(GitHubConnector.name);

  readonly platform = 'github' as const;
  readonly type = 'api' as const;

  /**
   * Verify that the GitHub PAT is valid.
   */
  async healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult> {
    const token = this.extractToken(connection);
    if (!token) {
      throw new ConnectorError(
        'github',
        'AUTH_EXPIRED',
        'No personal access token configured',
        false,
      );
    }

    try {
      const response = await this.githubFetch('/user', token);

      if (!response.ok) {
        return {
          status: 'unhealthy',
          message: `GitHub API returned ${response.status}`,
          details: {
            rate_limit_remaining: this.getRateLimitRemaining(response),
          },
        };
      }

      const remaining = this.getRateLimitRemaining(response);
      const resetDate = this.getRateLimitReset(response);

      return {
        status: remaining !== undefined && remaining < 100 ? 'degraded' : 'healthy',
        message: `GitHub API accessible, ${remaining ?? 'unknown'} requests remaining`,
        details: {
          rate_limit_remaining: remaining,
          rate_limit_reset: resetDate,
          api_version: '2022-11-28',
        },
      };
    } catch (error) {
      if (error instanceof ConnectorError) throw error;

      return {
        status: 'unhealthy',
        message: `GitHub API unreachable: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Fetch starred repos and recent events from GitHub.
   */
  async fetchContent(connection: PlatformConnectionData, since: Date | null): Promise<FetchResult> {
    const token = this.extractToken(connection);
    if (!token) {
      throw new ConnectorError(
        'github',
        'AUTH_EXPIRED',
        'No personal access token configured',
        false,
      );
    }

    let apiCalls = 0;
    let rateLimitRemaining: number | undefined;
    const allItems: ContentItemInput[] = [];

    // 1. Fetch starred repos
    try {
      const starredUrl = since
        ? `/user/starred?per_page=100&sort=created&direction=desc`
        : `/user/starred?per_page=100&sort=created&direction=desc`;

      const starredResponse = await this.githubFetch(starredUrl, token, {
        Accept: 'application/vnd.github.v3.star+json',
      });
      apiCalls++;

      this.handleErrorResponse(starredResponse);

      const starredData = await starredResponse.json();
      rateLimitRemaining = this.getRateLimitRemaining(starredResponse);

      if (Array.isArray(starredData)) {
        for (const starred of starredData) {
          const starredAt = starred.starred_at
            ? new Date(starred.starred_at)
            : starred.pushed_at
              ? new Date(starred.pushed_at)
              : new Date();

          // Filter by since
          if (since && starredAt < since) continue;

          const repo = starred.full_name ? starred : starred.repo || starred;

          allItems.push({
            external_id: `github-star-${repo.id || repo.full_name}`,
            content_type: 'release', // starred repos treated as notable releases
            title: `Starred: ${repo.full_name}`,
            body: repo.description || null,
            media_urls: [],
            metadata: {
              stars: repo.stargazers_count,
              language: repo.language,
              source: 'starred',
            },
            author_name: repo.owner?.login || null,
            author_url: repo.owner?.html_url || null,
            original_url: repo.html_url,
            published_at: starredAt,
          });
        }
      }
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        'github',
        'NETWORK_ERROR',
        `Failed to fetch starred repos: ${(error as Error).message}`,
        true,
      );
    }

    // 2. Fetch user events (releases, pushes, issues)
    try {
      const response = await this.githubFetch('/users/current/received_events?per_page=100', token);
      apiCalls++;

      this.handleErrorResponse(response);

      const eventsData = await response.json();
      rateLimitRemaining = this.getRateLimitRemaining(response);

      const parsedEvents = this.parseResponse({
        type: 'events',
        data: eventsData,
      });

      // Filter by since
      for (const item of parsedEvents) {
        if (since && item.published_at < since) continue;
        allItems.push(item);
      }
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        'github',
        'NETWORK_ERROR',
        `Failed to fetch events: ${(error as Error).message}`,
        true,
      );
    }

    return {
      items: allItems,
      has_more: false, // single page for now
      metadata: {
        api_calls_made: apiCalls,
        rate_limit_remaining: rateLimitRemaining,
      },
    };
  }

  /**
   * Parse raw GitHub API responses into normalized ContentItemInputs.
   * Supports events data format.
   */
  parseResponse(rawData: unknown): ContentItemInput[] {
    if (!rawData || typeof rawData !== 'object') return [];

    const data = rawData as { type?: string; data?: unknown[] };

    if (data.type === 'events' && Array.isArray(data.data)) {
      return this.parseEvents(data.data);
    }

    return [];
  }

  // --- Private helpers ---

  private parseEvents(events: unknown[]): ContentItemInput[] {
    const items: ContentItemInput[] = [];

    for (const raw of events) {
      const event = raw as {
        id: string;
        type: string;
        actor: { login: string; url: string };
        repo: { name: string; url: string };
        payload: Record<string, unknown>;
        created_at: string;
      };

      switch (event.type) {
        case 'ReleaseEvent': {
          const release = event.payload.release as {
            id: number;
            tag_name: string;
            name: string | null;
            body: string | null;
            html_url: string;
            published_at: string;
          };
          items.push({
            external_id: `github-event-${event.id}`,
            content_type: 'release',
            title: release.name || `Release ${release.tag_name}`,
            body: release.body || null,
            media_urls: [],
            metadata: {
              tag_name: release.tag_name,
              repo: event.repo.name,
              event_type: 'ReleaseEvent',
            },
            author_name: event.actor.login,
            author_url: event.actor.url.replace('api.github.com/users', 'github.com'),
            original_url: release.html_url,
            published_at: new Date(release.published_at || event.created_at),
          });
          break;
        }

        case 'PushEvent': {
          const commits =
            (event.payload.commits as Array<{
              sha: string;
              message: string;
              url: string;
            }>) || [];
          const ref = (event.payload.ref as string) || '';
          const branch = ref.replace('refs/heads/', '');

          items.push({
            external_id: `github-event-${event.id}`,
            content_type: 'commit',
            title: `${commits.length} commits to ${event.repo.name}/${branch}`,
            body: commits.map((c) => `- ${c.message}`).join('\n'),
            media_urls: [],
            metadata: {
              repo: event.repo.name,
              branch,
              commit_count: commits.length,
              event_type: 'PushEvent',
            },
            author_name: event.actor.login,
            author_url: event.actor.url.replace('api.github.com/users', 'github.com'),
            original_url: `https://github.com/${event.repo.name}/commits/${branch}`,
            published_at: new Date(event.created_at),
          });
          break;
        }

        case 'IssuesEvent': {
          const issue = event.payload.issue as {
            number: number;
            title: string;
            body: string | null;
            html_url: string;
          };
          const action = event.payload.action as string;

          items.push({
            external_id: `github-event-${event.id}`,
            content_type: 'issue',
            title: `[${action}] ${issue.title}`,
            body: issue.body || null,
            media_urls: [],
            metadata: {
              repo: event.repo.name,
              issue_number: issue.number,
              action,
              event_type: 'IssuesEvent',
            },
            author_name: event.actor.login,
            author_url: event.actor.url.replace('api.github.com/users', 'github.com'),
            original_url: issue.html_url,
            published_at: new Date(event.created_at),
          });
          break;
        }

        // Skip non-content events (WatchEvent, ForkEvent, etc.)
        default:
          break;
      }
    }

    return items;
  }

  private extractToken(connection: PlatformConnectionData): string | null {
    if (!connection.auth_data) return null;
    return (connection.auth_data.personal_access_token as string) || null;
  }

  private async githubFetch(
    path: string,
    token: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const url = path.startsWith('http') ? path : `${GITHUB_API_BASE}${path}`;

    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...extraHeaders,
      },
    });
  }

  private handleErrorResponse(response: Response): void {
    if (response.ok) return;

    const remaining = this.getRateLimitRemaining(response);

    if (response.status === 401) {
      throw new ConnectorError(
        'github',
        'AUTH_EXPIRED',
        'GitHub API token is invalid or expired',
        false,
      );
    }

    if (response.status === 403 && remaining === 0) {
      throw new ConnectorError('github', 'RATE_LIMITED', 'GitHub API rate limit exceeded', true);
    }

    if (response.status === 403) {
      throw new ConnectorError(
        'github',
        'AUTH_REVOKED',
        'GitHub API access forbidden — token may lack required scopes',
        false,
      );
    }

    throw new ConnectorError(
      'github',
      'PLATFORM_ERROR',
      `GitHub API returned ${response.status}`,
      response.status >= 500,
    );
  }

  private getRateLimitRemaining(response: Response): number | undefined {
    const headers = response.headers;
    const val =
      typeof headers.get === 'function'
        ? headers.get('x-ratelimit-remaining')
        : (headers as unknown as Map<string, string>).get?.('x-ratelimit-remaining');
    return val !== null && val !== undefined ? parseInt(val, 10) : undefined;
  }

  private getRateLimitReset(response: Response): Date | undefined {
    const headers = response.headers;
    const val =
      typeof headers.get === 'function'
        ? headers.get('x-ratelimit-reset')
        : (headers as unknown as Map<string, string>).get?.('x-ratelimit-reset');
    return val !== null && val !== undefined ? new Date(parseInt(val, 10) * 1000) : undefined;
  }
}
