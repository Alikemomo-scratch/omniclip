'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { digestsApi, contentApi } from '@/lib/api-client';
import type { Digest, TopicGroup, ContentItem, ApiError } from '@/lib/api-client';

export default function DigestsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedDigest, setSelectedDigest] = useState<Digest | null>(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['digests', typeFilter, showArchived],
    queryFn: () => digestsApi.list({
      type: typeFilter || undefined,
      archived: showArchived || undefined,
    }),
  });

  const generateMutation = useMutation({
    mutationFn: digestsApi.generate,
    onMutate: () => {
      setGenerating(true);
      setError('');
    },
    onSuccess: () => {
      // Refetch digest list after generation
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      setGenerating(false);
    },
    onError: (err: ApiError) => {
      setError(err.message || 'Failed to generate digest');
      setGenerating(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => digestsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      setSelectedDigest(null);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => digestsApi.unarchive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      setSelectedDigest(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => digestsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digests'] });
      setSelectedDigest(null);
    },
  });

  function handleGenerateDaily() {
    const now = new Date();
    const dayAgo = new Date(now);
    dayAgo.setDate(dayAgo.getDate() - 1);

    generateMutation.mutate({
      digest_type: 'daily',
      period_start: dayAgo.toISOString(),
      period_end: now.toISOString(),
    });
  }

  function handleGenerateWeekly() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    generateMutation.mutate({
      digest_type: 'weekly',
      period_start: weekAgo.toISOString(),
      period_end: now.toISOString(),
    });
  }

  const digests = data?.digests ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">AI Digests</h1>

        <div className="flex gap-2">
          <button
            onClick={handleGenerateDaily}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {generating ? 'Generating...' : 'Daily Digest'}
          </button>
          <button
            onClick={handleGenerateWeekly}
            disabled={generating}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
          >
            Weekly Digest
          </button>
        </div>
      </div>

      {/* Archive tabs */}
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

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Type filter chips */}
      <div className="flex gap-2 mb-6">
        {(['', 'daily', 'weekly'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && <div className="text-center py-12 text-gray-500">Loading digests...</div>}

      {/* Error */}
      {isError && <div className="text-center py-12 text-red-600">Failed to load digests.</div>}

      {/* Empty state */}
      {!isLoading && !isError && digests.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No digests yet</p>
          <p className="text-sm">
            Click &quot;Daily Digest&quot; or &quot;Weekly Digest&quot; to generate your first
            AI-powered content summary.
          </p>
        </div>
      )}

      {/* Digest list / detail split view */}
      {digests.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Digest list */}
          <div className="lg:col-span-1 space-y-3">
            {digests.map((digest) => (
              <DigestCard
                key={digest.id}
                digest={digest}
                isSelected={selectedDigest?.id === digest.id}
                onSelect={() => setSelectedDigest(digest)}
                showArchived={showArchived}
                onArchive={(id) => archiveMutation.mutate(id)}
                onUnarchive={(id) => unarchiveMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selectedDigest ? (
              <DigestDetail digest={selectedDigest} />
            ) : (
              <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-400">
                Select a digest to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DigestCard({
  digest,
  isSelected,
  onSelect,
  showArchived,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  digest: Digest;
  isSelected: boolean;
  onSelect: () => void;
  showArchived: boolean;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    generating: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };

  const typeColors: Record<string, string> = {
    daily: 'bg-blue-50 text-blue-600',
    weekly: 'bg-purple-50 text-purple-600',
  };

  return (
    <div
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'bg-blue-50 border-blue-300 shadow-sm'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between">
        <button onClick={onSelect} className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColors[digest.digest_type] || 'bg-gray-100 text-gray-600'}`}
            >
              {digest.digest_type}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColors[digest.status] || 'bg-gray-100 text-gray-600'}`}
            >
              {digest.status}
            </span>
          </div>

          <div className="text-sm text-gray-700 mb-1">
            {new Date(digest.period_start).toLocaleDateString()} &ndash;{' '}
            {new Date(digest.period_end).toLocaleDateString()}
          </div>

          <div className="text-xs text-gray-400">
            {digest.item_count} items
            {digest.generated_at && (
              <> &middot; Generated {new Date(digest.generated_at).toLocaleString()}</>
            )}
          </div>
        </button>

        <div className="flex gap-1 flex-shrink-0 ml-2">
          {showArchived ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnarchive(digest.id); }}
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
              onClick={(e) => { e.stopPropagation(); onArchive(digest.id); }}
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
            onClick={(e) => { e.stopPropagation(); onDelete(digest.id); }}
            title="删除"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function DigestDetail({ digest }: { digest: Digest }) {
  const topicGroups = digest.topic_groups ?? [];

  // Collect all unique item_ids across topic groups
  const allItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of topicGroups) {
      for (const id of group.item_ids) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  }, [topicGroups]);

  // Batch fetch content items for all topic groups
  const { data: contentItems } = useQuery({
    queryKey: ['digest-content-items', digest.id],
    queryFn: async () => {
      if (allItemIds.length === 0) return {};
      const results = await Promise.allSettled(
        allItemIds.map((id) => contentApi.getById(id)),
      );
      const itemMap: Record<string, ContentItem> = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          itemMap[result.value.id] = result.value;
        }
      }
      return itemMap;
    },
    enabled: allItemIds.length > 0,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const itemMap = contentItems ?? {};

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-bold capitalize">{digest.digest_type} Digest</h2>
          <span className="text-sm text-gray-400">
            {new Date(digest.period_start).toLocaleDateString()} &ndash;{' '}
            {new Date(digest.period_end).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {digest.item_count} content items &middot; Language: {digest.language}
        </p>
      </div>

      {/* Trend Analysis */}
      {digest.trend_analysis && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Trend Analysis</h3>
          <p className="text-sm text-blue-900">{digest.trend_analysis}</p>
        </div>
      )}

      {/* Topic Groups */}
      {topicGroups.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Topics</h3>
          {topicGroups.map((group, idx) => (
            <TopicGroupCard key={idx} group={group} itemMap={itemMap} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 text-sm">
          No topic groups in this digest.
        </div>
      )}
    </div>
  );
}

function TopicGroupCard({ group, itemMap }: { group: TopicGroup; itemMap: Record<string, ContentItem> }) {
  const items = group.item_ids
    .map((id) => itemMap[id])
    .filter((item): item is ContentItem => item != null);

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="font-medium text-gray-900">{group.topic}</h4>
        <div className="flex gap-1">
          {group.platforms.map((platform) => (
            <span
              key={platform}
              className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs capitalize"
            >
              {platform}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-600">{group.summary}</p>

      {items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline truncate"
            >
              <span className="px-1 py-0.5 bg-gray-200 text-gray-500 rounded text-[10px] capitalize flex-shrink-0">
                {item.platform}
              </span>
              <span className="truncate">
                {item.title || item.body?.slice(0, 80) || item.original_url}
              </span>
            </a>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {group.item_ids.length} related {group.item_ids.length === 1 ? 'item' : 'items'}
        </p>
      )}
    </div>
  );
}
