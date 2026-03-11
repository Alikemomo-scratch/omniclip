import { describe, it, expect } from 'vitest';
import { parseTwitterTimeline } from '../../src/content/twitter/parser';
import type { ContentItemInput } from '@omniclip/shared';

/**
 * Sample Twitter GraphQL timeline response.
 * Twitter's GraphQL API returns deeply nested data with instructions → entries → tweet_results.
 * This mock captures the essential structure.
 */
function makeSampleTimelineResponse() {
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'tweet-1234567890',
                  sortIndex: '1710050400000',
                  content: {
                    entryType: 'TimelineTimelineItem',
                    itemContent: {
                      itemType: 'TimelineTweet',
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: '1234567890',
                          core: {
                            user_results: {
                              result: {
                                legacy: {
                                  name: 'Tech Writer',
                                  screen_name: 'techwriter',
                                },
                              },
                            },
                          },
                          legacy: {
                            full_text:
                              'This is a great tweet about TypeScript and testing! #typescript #tdd',
                            created_at: 'Sun Mar 10 06:00:00 +0000 2024',
                            favorite_count: 500,
                            retweet_count: 120,
                            reply_count: 30,
                            quote_count: 15,
                            bookmark_count: 75,
                            entities: {
                              hashtags: [{ text: 'typescript' }, { text: 'tdd' }],
                              media: [
                                {
                                  media_url_https: 'https://pbs.twimg.com/media/img1.jpg',
                                  type: 'photo',
                                },
                              ],
                              urls: [],
                            },
                            id_str: '1234567890',
                          },
                        },
                      },
                    },
                  },
                },
                {
                  entryId: 'tweet-9876543210',
                  sortIndex: '1710050300000',
                  content: {
                    entryType: 'TimelineTimelineItem',
                    itemContent: {
                      itemType: 'TimelineTweet',
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: '9876543210',
                          core: {
                            user_results: {
                              result: {
                                legacy: {
                                  name: 'News Bot',
                                  screen_name: 'newsbot',
                                },
                              },
                            },
                          },
                          legacy: {
                            full_text:
                              'Breaking: Major announcement today with no media or hashtags.',
                            created_at: 'Sun Mar 10 05:58:20 +0000 2024',
                            favorite_count: 10,
                            retweet_count: 2,
                            reply_count: 1,
                            quote_count: 0,
                            bookmark_count: 3,
                            entities: {
                              hashtags: [],
                              urls: [],
                            },
                            id_str: '9876543210',
                          },
                        },
                      },
                    },
                  },
                },
                // Cursor entry (should be skipped)
                {
                  entryId: 'cursor-bottom-1234',
                  sortIndex: '1710050200000',
                  content: {
                    entryType: 'TimelineTimelineCursor',
                    value: 'DAACCgABF...',
                    cursorType: 'Bottom',
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };
}

function makeTweetWithRetweet() {
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'tweet-rt-111',
                  sortIndex: '1710050100000',
                  content: {
                    entryType: 'TimelineTimelineItem',
                    itemContent: {
                      itemType: 'TimelineTweet',
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: 'rt-111',
                          core: {
                            user_results: {
                              result: {
                                legacy: {
                                  name: 'Retweeter',
                                  screen_name: 'retweeter',
                                },
                              },
                            },
                          },
                          legacy: {
                            full_text: 'RT @original: Original tweet text here',
                            created_at: 'Sun Mar 10 05:55:00 +0000 2024',
                            favorite_count: 0,
                            retweet_count: 0,
                            reply_count: 0,
                            quote_count: 0,
                            bookmark_count: 0,
                            retweeted_status_result: {
                              result: {
                                __typename: 'Tweet',
                                rest_id: 'orig-222',
                                core: {
                                  user_results: {
                                    result: {
                                      legacy: {
                                        name: 'Original Author',
                                        screen_name: 'original',
                                      },
                                    },
                                  },
                                },
                                legacy: {
                                  full_text: 'Original tweet text here',
                                  created_at: 'Sat Mar 09 12:00:00 +0000 2024',
                                  favorite_count: 1000,
                                  retweet_count: 500,
                                  reply_count: 50,
                                  quote_count: 20,
                                  bookmark_count: 100,
                                  entities: { hashtags: [], urls: [] },
                                  id_str: 'orig-222',
                                },
                              },
                            },
                            entities: { hashtags: [], urls: [] },
                            id_str: 'rt-111',
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };
}

describe('parseTwitterTimeline', () => {
  it('should parse tweets into ContentItemInput array', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);

    expect(items).toHaveLength(2);

    const first = items[0];
    expect(first.external_id).toBe('1234567890');
    expect(first.content_type).toBe('tweet');
    expect(first.title).toBeNull(); // Tweets don't have titles
    expect(first.body).toBe('This is a great tweet about TypeScript and testing! #typescript #tdd');
    expect(first.original_url).toBe('https://x.com/techwriter/status/1234567890');
    expect(first.author_name).toBe('Tech Writer');
    expect(first.author_url).toBe('https://x.com/techwriter');
    expect(first.published_at).toBeInstanceOf(Date);
  });

  it('should extract media URLs from entities', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);
    const first = items[0];

    expect(first.media_urls).toEqual(['https://pbs.twimg.com/media/img1.jpg']);
  });

  it('should return empty media_urls when no media is present', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);
    const second = items[1];

    expect(second.media_urls).toEqual([]);
  });

  it('should extract interaction metadata (likes, retweets, replies, quotes, bookmarks)', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);
    const first = items[0];

    expect(first.metadata).toMatchObject({
      likes: 500,
      retweets: 120,
      replies: 30,
      quotes: 15,
      bookmarks: 75,
    });
  });

  it('should extract hashtags into metadata', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);
    const first = items[0];

    expect(first.metadata).toMatchObject({
      hashtags: ['typescript', 'tdd'],
    });
  });

  it('should handle tweets with no hashtags', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);
    const second = items[1];

    expect(second.metadata.hashtags).toEqual([]);
  });

  it('should skip cursor entries (non-tweet items)', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);

    // 2 tweets + 1 cursor = only 2 items returned
    expect(items).toHaveLength(2);
  });

  it('should handle retweets by using the original tweet data', () => {
    const raw = makeTweetWithRetweet();
    const items = parseTwitterTimeline(raw);

    expect(items).toHaveLength(1);
    const rt = items[0];

    // Should use the retweeted (original) tweet's data
    expect(rt.external_id).toBe('orig-222');
    expect(rt.body).toBe('Original tweet text here');
    expect(rt.author_name).toBe('Original Author');
    expect(rt.author_url).toBe('https://x.com/original');
    expect(rt.metadata.likes).toBe(1000);
    expect(rt.metadata.retweets).toBe(500);
  });

  it('should return empty array for null/undefined input', () => {
    expect(parseTwitterTimeline(null)).toEqual([]);
    expect(parseTwitterTimeline(undefined)).toEqual([]);
    expect(parseTwitterTimeline({})).toEqual([]);
  });

  it('should return empty array when instructions are missing', () => {
    const raw = { data: { home: { home_timeline_urt: { instructions: [] } } } };
    expect(parseTwitterTimeline(raw)).toEqual([]);
  });

  it('should skip entries with TweetWithVisibilityResults (tombstone)', () => {
    const raw = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-tombstone',
                    sortIndex: '1710050000000',
                    content: {
                      entryType: 'TimelineTimelineItem',
                      itemContent: {
                        itemType: 'TimelineTweet',
                        tweet_results: {
                          result: {
                            __typename: 'TweetTombstone',
                            tombstone: {
                              text: {
                                text: 'This Tweet is from an account that no longer exists.',
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };
    const items = parseTwitterTimeline(raw);
    expect(items).toEqual([]);
  });

  it('all returned items should conform to ContentItemInput shape', () => {
    const raw = makeSampleTimelineResponse();
    const items = parseTwitterTimeline(raw);

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
