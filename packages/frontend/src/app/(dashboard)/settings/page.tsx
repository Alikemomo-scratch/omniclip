'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api-client';
import type { ApiError } from '@/lib/api-client';

const DEFAULT_DIGEST_PROMPT = `# Phase 1: Screening & Classification
You are a tech content curator. Classify the following content by topic and select the 3-5 most important items as headlines.

Importance criteria:
- Major releases or breakthroughs in AI/LLM
- Widely impactful technical changes
- Significant product launches

For non-headline items, write a one-liner summary each.

---PHASE_SEPARATOR---

# Phase 2: Headline Deep Dive
You are a senior tech journalist. Write detailed analysis for each important item in newspaper headline style:
- What is it and why it matters
- Impact on the industry/developers
- Key technical details`;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [digestPrompt, setDigestPrompt] = useState<string | null>(null);
  const [promptInitialized, setPromptInitialized] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => usersApi.me(),
  });

  // Initialize prompt from fetched user data
  useEffect(() => {
    if (user && !promptInitialized) {
      setDigestPrompt(user.digest_prompt);
      setPromptInitialized(true);
    }
  }, [user, promptInitialized]);

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
      digest_time: formData.get('digest_time') as string,
      timezone: formData.get('timezone') as string,
      content_retention_days: Number(formData.get('content_retention_days')),
      digest_prompt: digestPrompt,
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
          <label htmlFor="digest_time" className="block text-sm font-medium text-gray-700 mb-1">
            Digest Time
          </label>
          <input
            id="digest_time"
            name="digest_time"
            type="time"
            defaultValue={user.digest_time}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Time of day to generate your automatic digest.
          </p>
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

        <div>
          <label
            htmlFor="content_retention_days"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Content Retention (days)
          </label>
          <input
            id="content_retention_days"
            name="content_retention_days"
            type="number"
            min={7}
            max={365}
            defaultValue={user.content_retention_days}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            How many days to keep collected content (7&ndash;365).
          </p>
        </div>

        <div>
          <label
            htmlFor="digest_prompt"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Digest Prompt Template
          </label>
          <textarea
            id="digest_prompt"
            value={digestPrompt ?? DEFAULT_DIGEST_PROMPT}
            onChange={(e) => setDigestPrompt(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400">
              Use <code className="bg-gray-100 px-1 rounded">---PHASE_SEPARATOR---</code> to
              split Phase 1 (screening) and Phase 2 (deep-dive) prompts.
            </p>
            <button
              type="button"
              onClick={() => setDigestPrompt(null)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Reset to Default
            </button>
          </div>
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
