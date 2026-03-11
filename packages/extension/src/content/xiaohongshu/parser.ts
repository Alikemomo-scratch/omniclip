import type { ContentItemInput } from '@omniclip/shared';

/**
 * Raw Xiaohongshu feed API response shape (subset we care about).
 * Endpoint: /api/sns/web/v1/feed
 */
interface XhsFeedResponse {
  code: number;
  success: boolean;
  msg?: string;
  data: {
    cursor_score?: string;
    items: XhsFeedItem[];
  } | null;
}

interface XhsFeedItem {
  id: string;
  model_type: string;
  note_card: XhsNoteCard | null;
}

interface XhsNoteCard {
  title: string;
  desc: string;
  type: string; // 'normal' | 'video'
  image_list?: Array<{
    url_default: string;
    width?: number;
    height?: number;
  }>;
  video?: {
    media?: {
      stream?: {
        h264?: Array<{ master_url: string }>;
      };
    };
  };
  interact_info: {
    liked_count: string;
    collected_count: string;
    comment_count: string;
    share_count: string;
  };
  user: {
    nickname: string;
    user_id: string;
  };
  time: number; // seconds since epoch
  tag_list?: Array<{ name: string }>;
}

/**
 * Parse a Xiaohongshu /api/sns/web/v1/feed response into normalized ContentItemInput[].
 *
 * - Skips non-note items (ads, recommendations)
 * - Converts string interaction counts to numbers
 * - Maps 'video' type to content_type 'video', everything else to 'post'
 * - Extracts tags from tag_list into metadata
 */
export function parseXiaohongshuFeed(raw: unknown): ContentItemInput[] {
  const response = raw as XhsFeedResponse;

  // Validate response structure
  if (!response || response.code !== 0 || !response.data || !Array.isArray(response.data.items)) {
    return [];
  }

  const results: ContentItemInput[] = [];

  for (const item of response.data.items) {
    // Skip non-note items (ads, etc.)
    if (item.model_type !== 'note' || !item.note_card) {
      continue;
    }

    const card = item.note_card;
    const tags = card.tag_list?.map((t) => t.name) ?? [];
    const imageUrls = card.image_list?.map((img) => img.url_default) ?? [];
    const contentType = card.type === 'video' ? 'video' : 'post';

    const parsed: ContentItemInput = {
      external_id: item.id,
      content_type: contentType,
      title: card.title.trim() || null,
      body: card.desc || null,
      media_urls: imageUrls,
      metadata: {
        likes: parseInt(card.interact_info.liked_count, 10) || 0,
        collects: parseInt(card.interact_info.collected_count, 10) || 0,
        comments: parseInt(card.interact_info.comment_count, 10) || 0,
        shares: parseInt(card.interact_info.share_count, 10) || 0,
        tags,
      },
      author_name: card.user.nickname,
      author_url: `https://www.xiaohongshu.com/user/profile/${card.user.user_id}`,
      original_url: `https://www.xiaohongshu.com/explore/${item.id}`,
      published_at: new Date(card.time * 1000),
    };

    results.push(parsed);
  }

  return results;
}
