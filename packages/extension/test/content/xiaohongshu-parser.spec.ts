import { describe, it, expect } from 'vitest';
import { parseXiaohongshuFeed } from '../../src/content/xiaohongshu/parser';
import type { ContentItemInput } from '@omniclip/shared';

/**
 * Sample Xiaohongshu /api/sns/web/v1/feed response.
 * Structure based on actual XHS API format:
 * - data.items[].id — note id
 * - data.items[].note_card.title — title
 * - data.items[].note_card.desc — body text
 * - data.items[].note_card.image_list[].url_default — image URLs
 * - data.items[].note_card.interact_info.liked_count, collected_count, comment_count
 * - data.items[].note_card.user.nickname, user_id
 * - data.items[].note_card.time — publish timestamp (seconds)
 * - data.items[].note_card.type — 'normal' (image post) or 'video'
 */
function makeSampleFeedResponse() {
  return {
    code: 0,
    success: true,
    msg: '成功',
    data: {
      cursor_score: '1710050400000',
      items: [
        {
          id: 'note-abc123',
          model_type: 'note',
          note_card: {
            title: '测试标题 — Test Title',
            desc: '这是帖子正文 — This is the post body with some details',
            type: 'normal',
            image_list: [
              {
                url_default: 'https://sns-webpic-qc.xhscdn.com/img1.jpg',
                width: 1080,
                height: 1440,
              },
              {
                url_default: 'https://sns-webpic-qc.xhscdn.com/img2.jpg',
                width: 1080,
                height: 1080,
              },
            ],
            interact_info: {
              liked_count: '1200',
              collected_count: '300',
              comment_count: '85',
              share_count: '42',
            },
            user: {
              nickname: 'CreatorUser',
              user_id: 'user-xyz789',
            },
            time: 1710050400, // seconds since epoch
          },
        },
        {
          id: 'note-def456',
          model_type: 'note',
          note_card: {
            title: '',
            desc: 'A post with no title, only body text',
            type: 'video',
            image_list: [
              {
                url_default: 'https://sns-webpic-qc.xhscdn.com/thumb.jpg',
                width: 720,
                height: 1280,
              },
            ],
            video: {
              media: {
                stream: {
                  h264: [{ master_url: 'https://sns-video.xhscdn.com/video.mp4' }],
                },
              },
            },
            interact_info: {
              liked_count: '50',
              collected_count: '10',
              comment_count: '3',
              share_count: '1',
            },
            user: {
              nickname: 'VideoCreator',
              user_id: 'user-video001',
            },
            time: 1710050500,
            tag_list: [{ name: '美食' }, { name: '日常' }],
          },
        },
      ],
    },
  };
}

describe('parseXiaohongshuFeed', () => {
  it('should parse a normal image post into ContentItemInput', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);

    expect(items).toHaveLength(2);

    const first = items[0];
    expect(first.external_id).toBe('note-abc123');
    expect(first.content_type).toBe('post');
    expect(first.title).toBe('测试标题 — Test Title');
    expect(first.body).toBe('这是帖子正文 — This is the post body with some details');
    expect(first.media_urls).toEqual([
      'https://sns-webpic-qc.xhscdn.com/img1.jpg',
      'https://sns-webpic-qc.xhscdn.com/img2.jpg',
    ]);
    expect(first.original_url).toBe('https://www.xiaohongshu.com/explore/note-abc123');
    expect(first.author_name).toBe('CreatorUser');
    expect(first.author_url).toBe('https://www.xiaohongshu.com/user/profile/user-xyz789');
    expect(first.published_at).toEqual(new Date(1710050400 * 1000));
  });

  it('should include interaction metadata (likes, collects, comments, shares)', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);
    const first = items[0];

    expect(first.metadata).toMatchObject({
      likes: 1200,
      collects: 300,
      comments: 85,
      shares: 42,
    });
  });

  it('should handle post with empty title by setting title to null', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);
    const second = items[1];

    expect(second.external_id).toBe('note-def456');
    expect(second.title).toBeNull();
  });

  it('should parse video posts with content_type "video"', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);
    const videoPost = items[1];

    expect(videoPost.content_type).toBe('video');
    // Video posts still have a thumbnail in media_urls
    expect(videoPost.media_urls).toContain('https://sns-webpic-qc.xhscdn.com/thumb.jpg');
  });

  it('should include tags in metadata when present', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);
    const second = items[1];

    expect(second.metadata).toMatchObject({
      tags: ['美食', '日常'],
    });
  });

  it('should handle tags missing by defaulting to empty array', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);
    const first = items[0];

    expect(first.metadata.tags).toEqual([]);
  });

  it('should return empty array for response with no items', () => {
    const raw = {
      code: 0,
      success: true,
      data: { items: [] },
    };
    const items = parseXiaohongshuFeed(raw);
    expect(items).toEqual([]);
  });

  it('should return empty array for failed response (code !== 0)', () => {
    const raw = {
      code: -1,
      success: false,
      msg: 'need login',
      data: null,
    };
    const items = parseXiaohongshuFeed(raw);
    expect(items).toEqual([]);
  });

  it('should skip items that are not notes (e.g., ads)', () => {
    const raw = {
      code: 0,
      success: true,
      data: {
        items: [
          {
            id: 'ad-001',
            model_type: 'advertisement',
            note_card: null,
          },
          {
            id: 'note-real',
            model_type: 'note',
            note_card: {
              title: 'Real post',
              desc: 'Body text',
              type: 'normal',
              image_list: [],
              interact_info: {
                liked_count: '5',
                collected_count: '1',
                comment_count: '0',
                share_count: '0',
              },
              user: { nickname: 'User', user_id: 'u1' },
              time: 1710050400,
            },
          },
        ],
      },
    };
    const items = parseXiaohongshuFeed(raw);
    expect(items).toHaveLength(1);
    expect(items[0].external_id).toBe('note-real');
  });

  it('should handle missing image_list gracefully', () => {
    const raw = {
      code: 0,
      success: true,
      data: {
        items: [
          {
            id: 'note-no-imgs',
            model_type: 'note',
            note_card: {
              title: 'Text only post',
              desc: 'No images here',
              type: 'normal',
              interact_info: {
                liked_count: '0',
                collected_count: '0',
                comment_count: '0',
                share_count: '0',
              },
              user: { nickname: 'TextUser', user_id: 'u2' },
              time: 1710050400,
            },
          },
        ],
      },
    };
    const items = parseXiaohongshuFeed(raw);
    expect(items).toHaveLength(1);
    expect(items[0].media_urls).toEqual([]);
  });

  it('should parse numeric string interaction counts into numbers', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);
    const meta = items[0].metadata;

    expect(typeof meta.likes).toBe('number');
    expect(typeof meta.collects).toBe('number');
    expect(typeof meta.comments).toBe('number');
    expect(typeof meta.shares).toBe('number');
  });

  it('all returned items should conform to ContentItemInput shape', () => {
    const raw = makeSampleFeedResponse();
    const items = parseXiaohongshuFeed(raw);

    for (const item of items) {
      expect(item).toHaveProperty('external_id');
      expect(item).toHaveProperty('content_type');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('body');
      expect(item).toHaveProperty('media_urls');
      expect(item).toHaveProperty('metadata');
      expect(item).toHaveProperty('author_name');
      expect(item).toHaveProperty('author_url');
      expect(item).toHaveProperty('original_url');
      expect(item).toHaveProperty('published_at');
      expect(Array.isArray(item.media_urls)).toBe(true);
      expect(item.published_at).toBeInstanceOf(Date);
    }
  });
});
