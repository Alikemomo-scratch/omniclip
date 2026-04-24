import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformConnectionData } from '@omniclip/shared';
import { Rettiwt } from 'rettiwt-api';
import { ConnectorError } from '../../src/connectors/interfaces/connector-error';
import { TwitterConnector } from '../../src/connectors/twitter/twitter.connector';
import { buildApiKeyFromCookies } from '../../src/connectors/twitter/twitter.utils';

const mockDetails = vi.fn();
const mockFollowed = vi.fn();
const mockFollowing = vi.fn();

vi.mock('rettiwt-api', () => ({
  Rettiwt: vi.fn().mockImplementation(() => ({
    user: {
      details: mockDetails,
      followed: mockFollowed,
      following: mockFollowing,
    },
  })),
}));

interface MockApiError extends Error {
  response: {
    status: number;
  };
}

function createConnection(authData: Record<string, unknown>): PlatformConnectionData {
  return {
    id: 'conn_123',
    user_id: 'user_123',
    platform: 'twitter',
    connection_type: 'api',
    credential_type: 'api_key',
    status: 'active',
    auth_data: authData,
    sync_interval_minutes: 60,
    last_sync_at: null,
  };
}

function createApiError(status: number, message = `Request failed with status code ${status}`): MockApiError {
  return Object.assign(new Error(message), {
    response: { status },
  });
}

function createTweet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tweet-1',
    fullText: 'Hello from Twitter',
    createdAt: '2026-04-22T10:00:00.000Z',
    likeCount: 11,
    retweetCount: 7,
    replyCount: 3,
    media: [
      {
        id: 'media-1',
        type: 'photo',
        url: 'https://cdn.example.com/image.jpg',
      },
    ],
    quoted: {
      id: 'quoted-1',
      fullText: 'Quoted tweet text',
    },
    tweetBy: {
      userName: 'alice',
    },
    urls: ['https://example.com/story'],
    entities: {
      urls: ['https://example.com/story'],
    },
    ...overrides,
  };
}

describe('TwitterConnector', () => {
  let connector: TwitterConnector;

  beforeEach(() => {
    connector = new TwitterConnector();
    vi.clearAllMocks();
    mockDetails.mockReset();
    mockFollowed.mockReset();
    mockFollowing.mockReset();

    mockFollowing.mockResolvedValue({
      list: [{ userName: 'alice' }, { userName: 'Bob' }],
      next: '',
    });
  });

  it('buildApiKeyFromCookies encodes cookie jar as base64 JSON', () => {
    const apiKey = buildApiKeyFromCookies('auth-cookie', 'csrf-cookie');

    expect(apiKey).toBe(
      Buffer.from(
        JSON.stringify([
          { name: 'auth_token', value: 'auth-cookie', domain: '.x.com', path: '/' },
          { name: 'ct0', value: 'csrf-cookie', domain: '.x.com', path: '/' },
        ]),
      ).toString('base64'),
    );
  });

  it('parseResponse maps tweets into ContentItemInput records', () => {
    const [item] = connector.parseResponse([createTweet()]);

    expect(item).toMatchObject({
      external_id: 'tweet-1',
      content_type: 'tweet',
      title: null,
      body: 'Hello from Twitter',
      media_urls: ['https://cdn.example.com/image.jpg'],
      metadata: {
        likeCount: 11,
        retweetCount: 7,
        replyCount: 3,
        quotedTweet: {
          id: 'quoted-1',
          fullText: 'Quoted tweet text',
        },
        urls: ['https://example.com/story'],
      },
      author_name: 'alice',
      author_url: 'https://x.com/alice',
      original_url: 'https://x.com/alice/status/tweet-1',
    });
    expect(item.published_at.toISOString()).toBe('2026-04-22T10:00:00.000Z');
  });

  it('healthCheck returns healthy when credentials are valid', async () => {
    mockDetails.mockResolvedValue({ userName: 'alice' });

    const result = await connector.healthCheck(createConnection({ api_key: 'api-key-123' }));

    expect(Rettiwt).toHaveBeenCalledWith({ apiKey: 'api-key-123', logging: false });
    expect(result).toMatchObject({
      status: 'healthy',
    });
  });

  it('healthCheck returns unhealthy when credentials are invalid', async () => {
    mockDetails.mockRejectedValue(createApiError(401));

    const result = await connector.healthCheck(createConnection({ api_key: 'expired-key' }));

    expect(result).toMatchObject({
      status: 'unhealthy',
    });
  });

  it('fetchContent throws AUTH_EXPIRED on 401 and 403 responses', async () => {
    for (const status of [401, 403]) {
      mockFollowed.mockRejectedValueOnce(createApiError(status));
      mockFollowing.mockResolvedValueOnce({ list: [], next: '' });

      await expect(
        connector.fetchContent(createConnection({ api_key: 'api-key-123' }), null),
      ).rejects.toMatchObject<Partial<ConnectorError>>({
        code: 'AUTH_EXPIRED',
        retryable: false,
      });
    }
  });

  it('fetchContent throws RATE_LIMITED on 429 responses', async () => {
    mockFollowed.mockRejectedValue(createApiError(429));
    mockFollowing.mockResolvedValue({ list: [], next: '' });

    await expect(
      connector.fetchContent(createConnection({ api_key: 'api-key-123' }), null),
    ).rejects.toMatchObject<Partial<ConnectorError>>({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('fetchContent returns normalized tweets and next cursor', async () => {
    mockFollowed.mockResolvedValue({
      list: [createTweet()],
      next: 'cursor-2',
    });

    const result = await connector.fetchContent(
      createConnection({
        auth_token: 'auth-cookie',
        ct0: 'csrf-cookie',
        next_cursor: 'cursor-1',
      }),
      null,
    );

    expect(Rettiwt).toHaveBeenCalledWith({
      apiKey: buildApiKeyFromCookies('auth-cookie', 'csrf-cookie'),
      logging: false,
    });
    expect(mockFollowed).toHaveBeenCalledWith('cursor-1');
    expect(result).toMatchObject({
      has_more: true,
      next_cursor: 'cursor-2',
      metadata: {
        api_calls_made: 2,
        following_count: 2,
      },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.external_id).toBe('tweet-1');
  });

  it('fetchContent filters out tweets from non-followed users', async () => {
    mockFollowed.mockResolvedValue({
      list: [
        createTweet({ id: 'tweet-1', tweetBy: { userName: 'alice' } }),
        createTweet({ id: 'tweet-2', tweetBy: { userName: 'stranger' } }),
        createTweet({ id: 'tweet-3', tweetBy: { userName: 'Bob' } }),
      ],
      next: '',
    });

    const result = await connector.fetchContent(
      createConnection({ api_key: 'api-key-123' }),
      null,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.external_id)).toEqual(['tweet-1', 'tweet-3']);
    expect(result.metadata?.pre_filter_count).toBe(3);
  });
});
