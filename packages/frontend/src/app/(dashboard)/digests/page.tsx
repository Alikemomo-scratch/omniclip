'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { digestsApi } from '@/lib/api-client';
import type { Digest, TopicGroup, ApiError } from '@/lib/api-client';

export default function DigestsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selectedDigest, setSelectedDigest] = useState<Digest | null>(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['digests', typeFilter],
    queryFn: () => digestsApi.list({ type: typeFilter || undefined }),
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
}: {
  digest: Digest;
  isSelected: boolean;
  onSelect: () => void;
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
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'bg-blue-50 border-blue-300 shadow-sm'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
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
  );
}

function DigestDetail({ digest }: { digest: Digest }) {
  const topicGroups = digest.topic_groups ?? [];

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
            <TopicGroupCard key={idx} group={group} />
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

function TopicGroupCard({ group }: { group: TopicGroup }) {
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
      <p className="text-xs text-gray-400 mt-2">
        {group.item_ids.length} related {group.item_ids.length === 1 ? 'item' : 'items'}
      </p>
    </div>
  );
}
