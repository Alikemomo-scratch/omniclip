/**
 * T046: Unit test for YouTube response parser.
 * Parse sample YouTube Data API v3 JSON → verify normalized ContentItemInput
 * (video title, channel, duration, view count, thumbnail).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { YouTubeConnector } from '../../src/connectors/youtube/youtube.connector';

/**
 * Sample YouTube Activities API response (activities#list).
 * Each activity has snippet + contentDetails.
 */
function buildActivityItem(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'youtube#activity',
    etag: 'test-etag',
    id: 'activity-001',
    snippet: {
      publishedAt: '2026-03-10T12:00:00Z',
      channelId: 'UC_channel_123',
      title: 'Amazing Tech Video',
      description: 'A deep dive into modern tech stacks.',
      thumbnails: {
        high: { url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg', width: 480, height: 360 },
        medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', width: 320, height: 180 },
      },
      channelTitle: 'TechChannel',
      type: 'upload',
    },
    contentDetails: {
      upload: {
        videoId: 'abc123',
      },
    },
    ...overrides,
  };
}

/**
 * Sample YouTube Video resource (videos#list).
 * Contains statistics + contentDetails (duration).
 */
function buildVideoResource(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'youtube#video',
    etag: 'video-etag',
    id: 'abc123',
    snippet: {
      publishedAt: '2026-03-10T12:00:00Z',
      channelId: 'UC_channel_123',
      title: 'Amazing Tech Video',
      description: 'A deep dive into modern tech stacks.',
      thumbnails: {
        high: { url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg', width: 480, height: 360 },
      },
      channelTitle: 'TechChannel',
      tags: ['tech', 'programming', 'tutorial'],
      categoryId: '28',
    },
    contentDetails: {
      duration: 'PT10M30S',
      dimension: '2d',
      definition: 'hd',
    },
    statistics: {
      viewCount: '150000',
      likeCount: '5000',
      commentCount: '320',
    },
    ...overrides,
  };
}

describe('YouTubeConnector.parseResponse()', () => {
  let connector: YouTubeConnector;

  // We instantiate the connector directly for unit testing parseResponse.
  // The constructor requires ConfigService and ConnectionsService but
  // parseResponse is a pure function that doesn't use them.
  // We cast to bypass constructor DI.
  beforeAll(() => {
    // Create instance without DI — parseResponse is a pure data transform
    connector = Object.create(YouTubeConnector.prototype);
  });

  // ── Activities parsing ──

  it('should parse a single upload activity into a ContentItemInput', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [buildActivityItem()],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      external_id: 'yt-abc123',
      content_type: 'video',
      title: 'Amazing Tech Video',
      body: 'A deep dive into modern tech stacks.',
      original_url: 'https://www.youtube.com/watch?v=abc123',
      author_name: 'TechChannel',
      published_at: new Date('2026-03-10T12:00:00Z'),
    });
  });

  it('should extract thumbnail URL into media_urls', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [buildActivityItem()],
    });

    expect(items[0].media_urls).toContain('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('should set metadata with channel_id from activity', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [buildActivityItem()],
    });

    expect(items[0].metadata).toMatchObject({
      channel_id: 'UC_channel_123',
    });
  });

  it('should generate author_url from channelId', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [buildActivityItem()],
    });

    expect(items[0].author_url).toBe('https://www.youtube.com/channel/UC_channel_123');
  });

  it('should parse multiple activities', () => {
    const activities = [
      buildActivityItem({ id: 'act-1', contentDetails: { upload: { videoId: 'vid1' } } }),
      buildActivityItem({
        id: 'act-2',
        snippet: {
          ...buildActivityItem().snippet,
          title: 'Second Video',
          channelTitle: 'OtherChannel',
          channelId: 'UC_other',
        },
        contentDetails: { upload: { videoId: 'vid2' } },
      }),
    ];

    const items = connector.parseResponse({ type: 'activities', data: activities });
    expect(items).toHaveLength(2);
    expect(items[0].external_id).toBe('yt-vid1');
    expect(items[1].external_id).toBe('yt-vid2');
    expect(items[1].title).toBe('Second Video');
  });

  it('should skip non-upload activities (like, favorite, subscription, etc.)', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [
        buildActivityItem({ snippet: { ...buildActivityItem().snippet, type: 'like' } }),
        buildActivityItem({ snippet: { ...buildActivityItem().snippet, type: 'favorite' } }),
        buildActivityItem({ snippet: { ...buildActivityItem().snippet, type: 'subscription' } }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it('should skip activities without contentDetails.upload.videoId', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [
        buildActivityItem({ contentDetails: {} }),
        buildActivityItem({ contentDetails: { upload: {} } }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it('should skip activities that have #shorts in title or description', () => {
    const items = connector.parseResponse({
      type: 'activities',
      data: [
        buildActivityItem({
          snippet: { ...buildActivityItem().snippet, title: 'Check out this #shorts video!' },
        }),
        buildActivityItem({
          snippet: {
            ...buildActivityItem().snippet,
            description: 'Description with #Shorts inside',
          },
        }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it('should handle missing thumbnails gracefully', () => {
    const activity = buildActivityItem({
      snippet: { ...buildActivityItem().snippet, thumbnails: {} },
    });

    const items = connector.parseResponse({ type: 'activities', data: [activity] });
    expect(items).toHaveLength(1);
    expect(items[0].media_urls).toEqual([]);
  });

  // ── Video details enrichment ──

  it('should parse video details and include statistics in metadata', () => {
    const items = connector.parseResponse({
      type: 'videos',
      data: [buildVideoResource()],
    });

    expect(items).toHaveLength(1);
    expect(items[0].metadata).toMatchObject({
      view_count: 150000,
      like_count: 5000,
      comment_count: 320,
      duration_seconds: 630, // 10min 30sec
    });
  });

  it('should parse ISO 8601 durations correctly (hours, minutes, seconds)', () => {
    const testCases = [
      { duration: 'PT1H30M15S', expected: 5415 }, // 1h 30m 15s
      { duration: 'PT5M', expected: 300 }, // 5m
      { duration: 'PT45S', expected: 45 }, // 45s
      { duration: 'PT2H', expected: 7200 }, // 2h
      { duration: 'PT1H1S', expected: 3601 }, // 1h 1s
    ];

    for (const { duration, expected } of testCases) {
      const items = connector.parseResponse({
        type: 'videos',
        data: [buildVideoResource({ contentDetails: { duration } })],
      });
      expect(items[0].metadata.duration_seconds).toBe(expected);
    }
  });

  it('should extract tags into metadata', () => {
    const items = connector.parseResponse({
      type: 'videos',
      data: [buildVideoResource()],
    });

    expect(items[0].metadata.tags).toEqual(['tech', 'programming', 'tutorial']);
  });

  it('should extract thumbnail_url into metadata from video resource', () => {
    const items = connector.parseResponse({
      type: 'videos',
      data: [buildVideoResource()],
    });

    expect(items[0].metadata.thumbnail_url).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  // ── Edge cases ──

  it('should return empty array for null/undefined input', () => {
    expect(connector.parseResponse(null)).toEqual([]);
    expect(connector.parseResponse(undefined)).toEqual([]);
    expect(connector.parseResponse({})).toEqual([]);
  });

  it('should return empty array for unknown type', () => {
    expect(connector.parseResponse({ type: 'unknown', data: [] })).toEqual([]);
  });

  it('should handle string statistics (YouTube API returns strings)', () => {
    const items = connector.parseResponse({
      type: 'videos',
      data: [
        buildVideoResource({
          statistics: {
            viewCount: '999999',
            likeCount: '42',
            commentCount: '7',
          },
        }),
      ],
    });

    expect(items[0].metadata.view_count).toBe(999999);
    expect(items[0].metadata.like_count).toBe(42);
    expect(items[0].metadata.comment_count).toBe(7);
  });

  it('should handle missing statistics gracefully', () => {
    const video = buildVideoResource();
    delete (video as Record<string, unknown>).statistics;

    const items = connector.parseResponse({ type: 'videos', data: [video] });
    expect(items).toHaveLength(1);
    expect(items[0].metadata.view_count).toBe(0);
    expect(items[0].metadata.like_count).toBe(0);
  });

  it('should handle missing description with null body', () => {
    const activity = buildActivityItem({
      snippet: { ...buildActivityItem().snippet, description: '' },
    });

    const items = connector.parseResponse({ type: 'activities', data: [activity] });
    expect(items[0].body).toBeNull();
  });
});
