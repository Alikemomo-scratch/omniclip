'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { contentApi } from '@/lib/api-client';
import type { ContentItem } from '@/lib/api-client';

const PLATFORMS = ['github', 'youtube', 'xiaohongshu', 'twitter'] as const;
const LIMIT = 20;

export default function FeedPage() {
  const [platform, setPlatform] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const observerTarget = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useInfiniteQuery({
      queryKey: ['content', platform, search],
      queryFn: ({ pageParam = 1 }) =>
        contentApi.list({
          page: pageParam,
          limit: LIMIT,
          platform: platform || undefined,
          search: search || undefined,
        }),
      getNextPageParam: (lastPage) => {
        const { page, total_pages } = lastPage.pagination;
        return page < total_pages ? page + 1 : undefined;
      },
      initialPageParam: 1,
    });

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = observerTarget.current;
    if (!el) return;

    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [handleObserver]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const allItems = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.pagination.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Content Feed</h1>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search content..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSearchInput('');
              }}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </form>

        {/* Platform filter chips */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPlatform('')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              platform === ''
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p === platform ? '' : p)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                platform === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-gray-500 mb-4">
          {total} {total === 1 ? 'item' : 'items'}
          {search && ` matching "${search}"`}
          {platform && ` from ${platform}`}
        </p>
      )}

      {/* Loading state */}
      {isLoading && <div className="text-center py-12 text-gray-500">Loading content...</div>}

      {/* Error state */}
      {isError && (
        <div className="text-center py-12">
          <p className="text-red-600">
            Failed to load content: {(error as { message?: string })?.message || 'Unknown error'}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && allItems.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No content yet</p>
          <p className="text-sm">
            Connect a platform and wait for the first sync, or adjust your filters.
          </p>
        </div>
      )}

      {/* Content cards */}
      <div className="space-y-4">
        {allItems.map((item) => (
          <ContentCard key={item.id} item={item} />
        ))}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={observerTarget} className="h-10" />

      {/* Loading more indicator */}
      {isFetchingNextPage && (
        <div className="text-center py-4 text-gray-500 text-sm">Loading more...</div>
      )}

      {/* End of list */}
      {!hasNextPage && allItems.length > 0 && (
        <div className="text-center py-4 text-gray-400 text-sm">No more content to load</div>
      )}
    </div>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const platformColors: Record<string, string> = {
    github: 'bg-gray-800 text-white',
    youtube: 'bg-red-600 text-white',
    xiaohongshu: 'bg-red-500 text-white',
    twitter: 'bg-blue-500 text-white',
  };

  const badgeClass = platformColors[item.platform] || 'bg-gray-200 text-gray-800';

  return (
    <a
      href={item.original_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-5 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Platform badge + content type */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${badgeClass}`}>
              {item.platform}
            </span>
            <span className="text-xs text-gray-400 capitalize">{item.content_type}</span>
          </div>

          {/* Title */}
          {item.title && <h3 className="font-medium text-gray-900 mb-1 truncate">{item.title}</h3>}

          {/* Body preview */}
          {item.body && <p className="text-sm text-gray-600 line-clamp-3">{item.body}</p>}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            {item.author_name && <span>by {item.author_name}</span>}
            <span>{new Date(item.published_at).toLocaleDateString()}</span>
            {item.ai_summary && (
              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">
                AI Summary
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary section */}
      {item.ai_summary && (
        <div className="mt-3 p-3 bg-purple-50 rounded-md">
          <p className="text-sm text-purple-800">{item.ai_summary}</p>
        </div>
      )}
    </a>
  );
}
