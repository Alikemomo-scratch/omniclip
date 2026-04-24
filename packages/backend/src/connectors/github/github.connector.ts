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

    // 1. Fetch latest releases of recently starred repos
    try {
      const starredUrl = `/user/starred?per_page=30&sort=created&direction=desc`;

      const starredResponse = await this.githubFetch(starredUrl, token, {
        Accept: 'application/vnd.github.v3.star+json',
      });
      apiCalls++;

      this.handleErrorResponse(starredResponse);

      const starredData = await starredResponse.json();
      rateLimitRemaining = this.getRateLimitRemaining(starredResponse);

      if (Array.isArray(starredData)) {
        const releasePromises = starredData.map(async (starred) => {
          const repo = starred.full_name ? starred : starred.repo || starred;
          try {
            const releaseUrl = `/repos/${repo.full_name}/releases/latest`;
            const releaseResponse = await this.githubFetch(releaseUrl, token);
            apiCalls++;

            if (releaseResponse.ok) {
              const release = (await releaseResponse.json()) as any;
              const publishedAt = new Date(release.published_at || release.created_at);

              // Filter by since
              if (!since || publishedAt >= since) {
                allItems.push({
                  external_id: `github-starred-release-${release.id}`,
                  content_type: 'release',
                  title: `${repo.full_name} Release: ${release.name || release.tag_name}`,
                  body: release.body || null,
                  media_urls: [],
                  metadata: {
                    tag_name: release.tag_name,
                    repo: repo.full_name,
                    source: 'starred_repo',
                  },
                  author_name: release.author?.login || repo.owner?.login || null,
                  author_url: release.author?.html_url || repo.owner?.html_url || null,
                  original_url: release.html_url,
                  published_at: publishedAt,
                });
              }
            }
          } catch (e) {
            // Ignore individual repo fetch errors to not fail the whole sync
          }
        });

        await Promise.all(releasePromises);
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
   * Currently unused — starred repo releases are parsed inline in fetchContent.
   * Retained to satisfy PlatformConnector interface.
   */
  parseResponse(_rawData: unknown): ContentItemInput[] {
    return [];
  }

  // --- Private helpers ---

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
