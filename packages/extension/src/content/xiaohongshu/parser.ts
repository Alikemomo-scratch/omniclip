import type { ContentItemInput } from '@omniclip/shared';

/**
 * Enhanced Xiaohongshu parser with flexible schema handling
 */

interface XhsFeedResponse {
  code: number;
  success: boolean;
  msg?: string;
  data?: {
    cursor_score?: string;
    items?: XhsFeedItem[];
    notes?: XhsNoteCard[];
  } | null;
}

interface XhsFeedItem {
  id: string;
  model_type: string;
  note_card?: XhsNoteCard;
  noteCard?: XhsNoteCard;
}

interface XhsNoteCard {
  title?: string;
  desc?: string;
  description?: string;
  type?: string;
  noteType?: string;
  image_list?: Array<{
    url_default?: string;
    url?: string;
    width?: number;
    height?: number;
  }>;
  imageList?: Array<{
    url_default?: string;
    url?: string;
  }>;
  video?: {
    media?: {
      stream?: {
        h264?: Array<{ master_url: string }>;
      };
    };
  };
  interact_info?: {
    liked_count?: string | number;
    collected_count?: string | number;
    comment_count?: string | number;
    share_count?: string | number;
  };
  interactInfo?: {
    likedCount?: string | number;
    collectedCount?: string | number;
    commentCount?: string | number;
    shareCount?: string | number;
  };
  user?: {
    nickname?: string;
    user_id?: string;
  };
  author?: {
    nickname?: string;
    userId?: string;
  };
  time?: number;
  createTime?: number;
  tag_list?: Array<{ name?: string }>;
  tags?: Array<{ name?: string }>;
}

function safeGet(obj: any, path: string, defaultValue?: any): any {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result == null) return defaultValue;
    result = result[key];
  }

  return result !== undefined ? result : defaultValue;
}

function extractImages(card: XhsNoteCard): string[] {
  const images: string[] = [];

  const imageList = card.image_list || card.imageList || [];
  for (const img of imageList) {
    const url = img.url_default || img.url;
    if (url) images.push(url);
  }

  return images;
}

function extractInteractionInfo(card: XhsNoteCard): {
  likes: number;
  collects: number;
  comments: number;
  shares: number;
} {
  const info = card.interact_info || card.interactInfo || {};

  return {
    likes: parseInt(String(info.liked_count || info.likedCount || 0), 10) || 0,
    collects: parseInt(String(info.collected_count || info.collectedCount || 0), 10) || 0,
    comments: parseInt(String(info.comment_count || info.commentCount || 0), 10) || 0,
    shares: parseInt(String(info.share_count || info.shareCount || 0), 10) || 0,
  };
}

function extractAuthor(card: XhsNoteCard): { name: string; id: string } {
  const user = card.user || card.author || {};
  return {
    name: user.nickname || 'Unknown User',
    id: user.user_id || user.userId || '',
  };
}

function extractTime(card: XhsNoteCard): Date {
  const timestamp = card.time || card.createTime;
  if (timestamp) {
    return new Date(timestamp * 1000);
  }
  return new Date();
}

function extractTags(card: XhsNoteCard): string[] {
  const tagList = card.tag_list || card.tags || [];
  return tagList.map((t) => t.name).filter((name): name is string => !!name);
}

export function parseXiaohongshuFeed(raw: unknown): ContentItemInput[] {
  console.log('[OmniClip XHS Parser] Parsing feed:', typeof raw);

  const response = raw as XhsFeedResponse;

  if (!response) {
    console.warn('[OmniClip XHS Parser] Empty response');
    return [];
  }

  if (response.code !== 0 && response.code !== undefined) {
    console.warn('[OmniClip XHS Parser] Non-zero code:', response.code, response.msg);
  }

  let items: XhsFeedItem[] = [];

  // Try different data structures
  if (Array.isArray(response.data?.items)) {
    items = response.data.items;
  } else if (Array.isArray(response.data?.notes)) {
    // Direct notes array
    items = response.data.notes.map((note: XhsNoteCard, index: number) => ({
      id: safeGet(note, 'id', `note-${index}`),
      model_type: 'note',
      note_card: note,
    }));
  } else if (Array.isArray(response.data)) {
    // Sometimes data is directly an array
    items = response.data.map((note: XhsNoteCard, index: number) => ({
      id: safeGet(note, 'id', `note-${index}`),
      model_type: 'note',
      note_card: note,
    }));
  }

  if (items.length === 0) {
    console.warn('[OmniClip XHS Parser] No items found in response structure:', {
      hasData: !!response.data,
      dataType: typeof response.data,
      dataKeys: response.data ? Object.keys(response.data) : [],
    });
    return [];
  }

  const results: ContentItemInput[] = [];

  for (const item of items) {
    const card = item.note_card || item.noteCard;

    if (!card) {
      console.warn(`[OmniClip XHS Parser] Skipping item ${item.id}: no note_card`);
      continue;
    }

    try {
      const contentType = card.type === 'video' || card.noteType === 'video' ? 'video' : 'post';
      const images = extractImages(card);
      const interactions = extractInteractionInfo(card);
      const author = extractAuthor(card);
      const publishedAt = extractTime(card);
      const tags = extractTags(card);

      const title = (card.title || '').trim() || null;
      const body = card.desc || card.description || null;

      const parsed: ContentItemInput = {
        external_id: item.id,
        content_type: contentType,
        title,
        body,
        media_urls: images,
        metadata: {
          likes: interactions.likes,
          collects: interactions.collects,
          comments: interactions.comments,
          shares: interactions.shares,
          tags,
        },
        author_name: author.name,
        author_url: author.id ? `https://www.xiaohongshu.com/user/profile/${author.id}` : null,
        original_url: `https://www.xiaohongshu.com/explore/${item.id}`,
        published_at: publishedAt,
      };

      results.push(parsed);
    } catch (err) {
      console.error(`[OmniClip XHS Parser] Failed to parse item ${item.id}:`, err);
    }
  }

  console.log(`[OmniClip XHS Parser] Successfully parsed ${results.length}/${items.length} items`);
  return results;
}
