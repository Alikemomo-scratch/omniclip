import type { ContentItemInput } from '@omniclip/shared';

/**
 * Twitter GraphQL timeline response types (subset we care about).
 * Twitter's home timeline uses deeply nested GraphQL response format.
 */

interface TwitterTimelineResponse {
  data?: {
    home?: {
      home_timeline_urt?: {
        instructions: TwitterInstruction[];
      };
    };
  };
}

interface TwitterInstruction {
  type: string;
  entries?: TwitterEntry[];
}

interface TwitterEntry {
  entryId: string;
  sortIndex: string;
  content: {
    entryType: string;
    itemContent?: {
      itemType: string;
      tweet_results?: {
        result: TwitterTweetResult;
      };
    };
    value?: string;
    cursorType?: string;
  };
}

interface TwitterTweetResult {
  __typename: string;
  rest_id?: string;
  core?: {
    user_results: {
      result: {
        legacy: {
          name: string;
          screen_name: string;
        };
      };
    };
  };
  legacy?: TwitterLegacyTweet;
  tombstone?: unknown;
}

interface TwitterLegacyTweet {
  full_text: string;
  created_at: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  bookmark_count: number;
  id_str: string;
  retweeted_status_result?: {
    result: TwitterTweetResult;
  };
  entities: {
    hashtags: Array<{ text: string }>;
    media?: Array<{
      media_url_https: string;
      type: string;
    }>;
    urls: Array<unknown>;
  };
}

/**
 * Extract tweet data from a tweet result, handling retweets by unwrapping
 * to the original tweet.
 */
function extractTweetData(tweetResult: TwitterTweetResult): {
  tweet: TwitterLegacyTweet;
  user: { name: string; screen_name: string };
  restId: string;
} | null {
  // Skip tombstones and non-Tweet types
  if (tweetResult.__typename !== 'Tweet' || !tweetResult.legacy || !tweetResult.core) {
    return null;
  }

  const legacy = tweetResult.legacy;

  // If this is a retweet, unwrap to the original tweet
  if (legacy.retweeted_status_result?.result) {
    const original = legacy.retweeted_status_result.result;
    if (original.__typename !== 'Tweet' || !original.legacy || !original.core) {
      return null;
    }
    return {
      tweet: original.legacy,
      user: original.core.user_results.result.legacy,
      restId: original.rest_id ?? original.legacy.id_str,
    };
  }

  return {
    tweet: legacy,
    user: tweetResult.core.user_results.result.legacy,
    restId: tweetResult.rest_id ?? legacy.id_str,
  };
}

/**
 * Parse a Twitter GraphQL timeline response into normalized ContentItemInput[].
 *
 * - Extracts tweets from TimelineAddEntries instructions
 * - Skips cursor entries, tombstones, and non-tweet items
 * - Unwraps retweets to use original tweet data
 * - Extracts hashtags, media, and interaction counts
 */
export function parseTwitterTimeline(raw: unknown): ContentItemInput[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const response = raw as TwitterTimelineResponse;
  const instructions = response.data?.home?.home_timeline_urt?.instructions;

  if (!instructions || !Array.isArray(instructions)) {
    return [];
  }

  const results: ContentItemInput[] = [];

  for (const instruction of instructions) {
    if (instruction.type !== 'TimelineAddEntries' || !instruction.entries) {
      continue;
    }

    for (const entry of instruction.entries) {
      // Skip non-tweet entries (cursors, modules, etc.)
      if (entry.content.entryType !== 'TimelineTimelineItem') {
        continue;
      }

      const itemContent = entry.content.itemContent;
      if (!itemContent || itemContent.itemType !== 'TimelineTweet') {
        continue;
      }

      const tweetResults = itemContent.tweet_results;
      if (!tweetResults?.result) {
        continue;
      }

      const extracted = extractTweetData(tweetResults.result);
      if (!extracted) {
        continue;
      }

      const { tweet, user, restId } = extracted;
      const hashtags = tweet.entities.hashtags?.map((h) => h.text) ?? [];
      const mediaUrls = tweet.entities.media?.map((m) => m.media_url_https) ?? [];

      const parsed: ContentItemInput = {
        external_id: restId,
        content_type: 'tweet',
        title: null, // Tweets don't have titles
        body: tweet.full_text,
        media_urls: mediaUrls,
        metadata: {
          likes: tweet.favorite_count,
          retweets: tweet.retweet_count,
          replies: tweet.reply_count,
          quotes: tweet.quote_count,
          bookmarks: tweet.bookmark_count,
          hashtags,
        },
        author_name: user.name,
        author_url: `https://x.com/${user.screen_name}`,
        original_url: `https://x.com/${user.screen_name}/status/${restId}`,
        published_at: new Date(tweet.created_at),
      };

      results.push(parsed);
    }
  }

  return results;
}
