'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { connectionsApi, getToken } from '@/lib/api-client';
import type { Connection, ApiError } from '@/lib/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface PlatformConfig {
  id: string;
  label: string;
  authType: 'token' | 'oauth' | 'extension';
  authField?: string;
  placeholder?: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'github',
    label: 'GitHub',
    authType: 'token',
    authField: 'personal_access_token',
    placeholder: 'ghp_...',
  },
  { id: 'youtube', label: 'YouTube', authType: 'oauth' },
  { id: 'twitter', label: 'Twitter / X', authType: 'extension' },
  { id: 'xiaohongshu', label: 'Xiaohongshu / 小红书', authType: 'extension' },
];

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [syncInterval, setSyncInterval] = useState('60');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionsApi.list(),
  });

  const { data: platformsData } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => connectionsApi.listPlatforms(),
  });

  const dynamicPlatforms =
    platformsData?.platforms.map((p) => {
      const existing = PLATFORMS.find((staticP) => staticP.id === p);
      if (existing) return existing;

      // Default fallback for new connectors
      return {
        id: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
        authType: 'token',
        authField: 'api_token',
        placeholder: 'Enter token...',
      } as PlatformConfig;
    }) || PLATFORMS;

  const createMutation = useMutation({
    mutationFn: connectionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setShowAddForm(false);
      setSelectedPlatform('');
      setAuthToken('');
      setError('');
    },
    onError: (err: ApiError) => {
      setError(err.message || 'Failed to create connection');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => connectionsApi.test(id),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => connectionsApi.syncNow(id),
    onSuccess: () => {
      alert('Sync triggered successfully. Content will appear in your feed shortly.');
    },
    onError: (err: ApiError) => {
      alert(`Sync failed: ${err.message}`);
    },
  });

  function handleConnectOAuth(platformId: string) {
    // Redirect to backend OAuth endpoint — the backend will redirect to the provider's consent screen
    const token = getToken();
    // We need to pass the JWT token as a query parameter since the redirect won't have cookies
    window.location.href = `${API_BASE}/auth/${platformId}?token=${encodeURIComponent(token || '')}`;
  }

  function handleAddConnection(e: React.FormEvent) {
    e.preventDefault();
    const platform = dynamicPlatforms.find((p) => p.id === selectedPlatform);
    if (!platform || (platform.authType === 'token' && !platform.authField)) return;

    createMutation.mutate({
      platform: selectedPlatform,
      connection_type: platform.authType === 'extension' ? 'extension' : 'api',
      auth_data: platform.authType === 'token' ? { [platform.authField!]: authToken } : undefined,
      sync_interval_minutes: parseInt(syncInterval, 10),
    });
  }

  function handleCopyToken() {
    const token = getToken();
    if (token) {
      navigator.clipboard.writeText(token);
      alert('Token copied to clipboard! Paste it into the OmniClip extension popup.');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Connections</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your connected platforms. For extension-based platforms,{' '}
            <button onClick={handleCopyToken} className="text-blue-600 hover:underline">
              click here to copy your token
            </button>{' '}
            for the extension popup.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          {showAddForm ? 'Cancel' : 'Add Connection'}
        </button>
      </div>

      {/* Add connection form */}
      {showAddForm && (
        <div className="mb-6 p-6 bg-white rounded-lg shadow-sm border">
          <h2 className="text-lg font-medium mb-4">Add New Connection</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleAddConnection} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a platform</option>
                {dynamicPlatforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sync Interval</label>
              <select
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="60">Every 1 hour</option>
                <option value="360">Every 6 hours</option>
                <option value="1440">Every 1 day</option>
                <option value="10080">Every 1 week</option>
                <option value="43200">Every 1 month</option>
              </select>
            </div>

            {selectedPlatform &&
              (() => {
                const platform = dynamicPlatforms.find((p) => p.id === selectedPlatform);
                if (!platform) return null;

                if (platform.authType === 'oauth') {
                  return (
                    <div>
                      <p className="text-sm text-gray-600 mb-3">
                        {platform.label} uses OAuth for authentication. Click the button below to
                        authorize.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConnectOAuth(platform.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
                      >
                        Connect {platform.label} via OAuth
                      </button>
                    </div>
                  );
                }

                if (platform.authType === 'extension') {
                  return (
                    <div>
                      <p className="text-sm text-gray-600 mb-3">
                        {platform.label} is synced automatically via the OmniClip browser extension.
                        Make sure the extension is installed and you are logged into{' '}
                        {platform.label} in your browser.
                      </p>
                      <button
                        type="submit"
                        disabled={createMutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                      >
                        {createMutation.isPending ? 'Connecting...' : `Enable ${platform.label}`}
                      </button>
                    </div>
                  );
                }

                return (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Token
                      </label>
                      <input
                        type="password"
                        required
                        value={authToken}
                        onChange={(e) => setAuthToken(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={platform.placeholder}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {createMutation.isPending ? 'Connecting...' : 'Connect'}
                    </button>
                  </>
                );
              })()}
          </form>
        </div>
      )}

      {/* Connections list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading connections...</div>
      ) : !data?.connections?.length ? (
        <div className="text-center py-12 text-gray-500">
          <p>No connections yet. Add one to start syncing content.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.connections.map((conn: Connection) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onTest={() => testMutation.mutate(conn.id)}
              onSync={() => syncMutation.mutate(conn.id)}
              onDelete={() => {
                if (confirm('Are you sure you want to disconnect?')) {
                  deleteMutation.mutate(conn.id);
                }
              }}
              testResult={
                testMutation.variables === conn.id
                  ? {
                      loading: testMutation.isPending,
                      data: testMutation.data,
                      error: testMutation.error as ApiError | null,
                    }
                  : undefined
              }
              syncState={
                syncMutation.variables === conn.id
                  ? {
                      loading: syncMutation.isPending,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionCard({
  connection,
  onTest,
  onSync,
  onDelete,
  testResult,
  syncState,
}: {
  connection: Connection;
  onTest: () => void;
  onSync: () => void;
  onDelete: () => void;
  testResult?: {
    loading: boolean;
    data?: { status: string; message: string } | null;
    error?: ApiError | null;
  };
  syncState?: {
    loading: boolean;
  };
}) {
  const statusColor =
    connection.status === 'active'
      ? 'bg-green-100 text-green-800'
      : connection.status === 'error'
        ? 'bg-red-100 text-red-800'
        : 'bg-gray-100 text-gray-800';

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="font-medium capitalize">{connection.platform}</h3>
            <p className="text-sm text-gray-500">
              Type: {connection.connection_type} | Sync every {connection.sync_interval_minutes}min
            </p>
            {connection.last_sync_at && (
              <p className="text-sm text-gray-400">
                Last synced: {new Date(connection.last_sync_at).toLocaleString()}
              </p>
            )}
            {connection.last_error && (
              <p className="text-sm text-red-500 mt-1">{connection.last_error}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
            {connection.status}
          </span>

          {connection.connection_type === 'api' ? (
            <button
              onClick={onSync}
              disabled={syncState?.loading || connection.status !== 'active'}
              className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              {syncState?.loading ? 'Syncing...' : 'Sync Now'}
            </button>
          ) : (
            <button
              onClick={() =>
                alert(
                  'This connection is synced securely in the background by your OmniClip browser extension (based on the sync interval you configured). To trigger a manual sync immediately, open the OmniClip extension popup in your browser toolbar and click "Sync Now".',
                )
              }
              className="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 border border-gray-200 rounded-md hover:bg-gray-100"
            >
              Sync Info
            </button>
          )}

          <button
            onClick={onTest}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {testResult?.loading ? 'Testing...' : 'Test'}
          </button>

          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      {testResult?.data && (
        <div
          className={`mt-3 p-2 rounded text-sm ${
            testResult.data.status === 'healthy'
              ? 'bg-green-50 text-green-700'
              : 'bg-yellow-50 text-yellow-700'
          }`}
        >
          {testResult.data.status}: {testResult.data.message}
        </div>
      )}

      {testResult?.error && (
        <div className="mt-3 p-2 bg-red-50 text-red-700 rounded text-sm">
          Test failed: {testResult.error.message}
        </div>
      )}
    </div>
  );
}
