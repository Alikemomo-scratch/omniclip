'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/lib/api-client';
import type { ContentItem } from '@/lib/api-client';

const PLATFORMS = ['github', 'youtube', 'twitter'] as const;
const LIMIT = 20;

export default function FeedPage() {
  const [platform, setPlatform] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState<'none' | 'loaded' | 'all'>('none');
  const queryClient = useQueryClient();
  const observerTarget = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useInfiniteQuery({
      queryKey: ['content', platform, search, showArchived],
      queryFn: ({ pageParam = 1 }) =>
        contentApi.list({
          page: pageParam,
          limit: LIMIT,
          platform: platform || undefined,
          search: search || undefined,
          archived: showArchived || undefined,
        }),
      getNextPageParam: (lastPage) => {
        const { page, total_pages } = lastPage.pagination;
        return page < total_pages ? page + 1 : undefined;
      },
      initialPageParam: 1,
    });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => contentApi.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => contentApi.unarchive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content'] }),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => contentApi.batchDelete(ids),
    onSuccess: () => {
      setSelectedIds(new Set());
      setSelectAllMode('none');
      queryClient.invalidateQueries({ queryKey: ['content'] });
    },
  });

  const batchDeleteByFilterMutation = useMutation({
    mutationFn: () =>
      contentApi.batchDeleteByFilter({
        platform: platform || undefined,
        search: search || undefined,
        archived: showArchived || undefined,
      }),
    onSuccess: () => {
      setSelectedIds(new Set());
      setSelectAllMode('none');
      queryClient.invalidateQueries({ queryKey: ['content'] });
    },
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

  const allItems = (() => {
    const items = data?.pages.flatMap((page) => page.items) ?? [];
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  })();
  const total = data?.pages[0]?.pagination.total ?? 0;

  function toggleSelect(id: string) {
    setSelectAllMode('none');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === allItems.length && selectAllMode !== 'none') {
      setSelectedIds(new Set());
      setSelectAllMode('none');
    } else {
      setSelectedIds(new Set(allItems.map((i) => i.id)));
      setSelectAllMode('loaded');
    }
  }

  function handleBatchDelete() {
    const isDeleteAll = selectAllMode === 'all';
    const count = isDeleteAll ? total : selectedIds.size;
    if (count === 0) return;
    if (!confirm(`确认删除${isDeleteAll ? '全部' : '选中的'} ${count} 条内容？此操作不可恢复。`)) return;

    if (isDeleteAll) {
      batchDeleteByFilterMutation.mutate();
    } else {
      batchDeleteMutation.mutate(Array.from(selectedIds));
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Content Feed</h1>

        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setShowArchived(false)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              !showArchived
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              showArchived
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            已归档
          </button>
        </div>

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

      {/* Results count + batch actions */}
      {!isLoading && (
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} {total === 1 ? 'item' : 'items'}
              {search && ` matching "${search}"`}
              {platform && ` from ${platform}`}
            </p>
            {allItems.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allItems.length > 0 && selectedIds.size === allItems.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  全选
                </label>
                {(selectedIds.size > 0 || selectAllMode === 'all') && (
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchDeleteMutation.isPending || batchDeleteByFilterMutation.isPending}
                    className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {batchDeleteMutation.isPending || batchDeleteByFilterMutation.isPending
                      ? '删除中...'
                      : selectAllMode === 'all'
                        ? `删除全部 (${total})`
                        : `删除选中 (${selectedIds.size})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {selectAllMode === 'loaded' && total > allItems.length && (
            <div className="mt-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800 text-center">
              已选中当前已加载的 {allItems.length} 条内容。
              <button
                onClick={() => setSelectAllMode('all')}
                className="ml-1 font-medium text-blue-600 hover:text-blue-800 underline"
              >
                选择全部 {total} 条
              </button>
            </div>
          )}

          {selectAllMode === 'all' && (
            <div className="mt-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800 text-center">
              已选择全部 {total} 条匹配内容。
              <button
                onClick={() => { setSelectAllMode('none'); setSelectedIds(new Set()); }}
                className="ml-1 font-medium text-blue-600 hover:text-blue-800 underline"
              >
                取消选择
              </button>
            </div>
          )}
        </div>
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
          <ContentCard
            key={item.id}
            item={item}
            showArchived={showArchived}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
            onArchive={(id) => archiveMutation.mutate(id)}
            onUnarchive={(id) => unarchiveMutation.mutate(id)}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
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

function ContentCard({
  item,
  showArchived,
  selected,
  onToggleSelect,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  item: ContentItem;
  showArchived: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const platformColors: Record<string, string> = {
    github: 'bg-gray-800 text-white',
    youtube: 'bg-red-600 text-white',
    twitter: 'bg-blue-500 text-white',
  };

  const badgeClass = platformColors[item.platform] || 'bg-gray-200 text-gray-800';

  return (
    <div className={`p-5 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow ${selected ? 'ring-2 ring-blue-500 border-blue-300' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${badgeClass}`}>
              {item.platform}
            </span>
            <span className="text-xs text-gray-400 capitalize">{item.content_type}</span>
          </div>

          {item.title && (
            <a
              href={item.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 mb-1 truncate block hover:text-blue-600 hover:underline"
            >
              {item.title}
            </a>
          )}

          {item.body && (
            item.original_url && !item.title ? (
              <a
                href={item.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 line-clamp-3 block hover:text-blue-600"
              >
                {item.body}
              </a>
            ) : (
              <p className="text-sm text-gray-600 line-clamp-3">{item.body}</p>
            )
          )}

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

        <div className="flex gap-1 flex-shrink-0">
          {showArchived ? (
            <button
              onClick={() => onUnarchive(item.id)}
              title="恢复"
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414 0z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M4.293 9.707a1 1 0 010-1.414l5-5a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L10 5.414 5.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => onArchive(item.id)}
              title="归档"
              className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            title="删除"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {item.ai_summary && (
        <div className="mt-3 p-3 bg-purple-50 rounded-md">
          <p className="text-sm text-purple-800">{item.ai_summary}</p>
        </div>
      )}
    </div>
  );
}
