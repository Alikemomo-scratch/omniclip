'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api-client';
import type { ApiError } from '@/lib/api-client';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => usersApi.me(),
  });

  const updateMutation = useMutation({
    mutationFn: usersApi.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['user'], updated);
      setSuccess('Settings saved.');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err: ApiError) => {
      setError(err.message || 'Failed to save settings');
      setSuccess('');
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      display_name: formData.get('display_name') as string,
      preferred_language: formData.get('preferred_language') as string,
      digest_frequency: formData.get('digest_frequency') as string,
      timezone: formData.get('timezone') as string,
    });
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading settings...</div>;
  }

  if (!user) {
    return <div className="text-center py-12 text-gray-500">Unable to load user profile.</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
          />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
        </div>

        <div>
          <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
            Display Name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            defaultValue={user.display_name}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="preferred_language"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Preferred Language
          </label>
          <select
            id="preferred_language"
            name="preferred_language"
            defaultValue={user.preferred_language}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="en">English</option>
            <option value="zh">Chinese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="digest_frequency"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Digest Frequency
          </label>
          <select
            id="digest_frequency"
            name="digest_frequency"
            defaultValue={user.digest_frequency}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="manual">Manual only</option>
          </select>
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={user.timezone}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time (US)</option>
            <option value="America/Chicago">Central Time (US)</option>
            <option value="America/Denver">Mountain Time (US)</option>
            <option value="America/Los_Angeles">Pacific Time (US)</option>
            <option value="Asia/Shanghai">China Standard Time</option>
            <option value="Asia/Tokyo">Japan Standard Time</option>
            <option value="Asia/Seoul">Korea Standard Time</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Berlin">Central European</option>
          </select>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
