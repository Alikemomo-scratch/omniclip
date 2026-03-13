'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * YouTube OAuth callback handler.
 * After Google redirects back to the backend callback, the backend creates the
 * connection and redirects here with ?success=true or ?error=<message>.
 *
 * Wrapped in Suspense as required by Next.js 15 for useSearchParams().
 */
export default function YouTubeCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-sm border text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-900">Loading...</h2>
          </div>
        </div>
      }
    >
      <YouTubeCallbackContent />
    </Suspense>
  );
}

function YouTubeCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      setStatus('success');
      // Redirect to connections page after a short delay
      const timer = setTimeout(() => {
        router.push('/connections');
      }, 2000);
      return () => clearTimeout(timer);
    } else if (error) {
      setStatus('error');
      setErrorMessage(decodeURIComponent(error));
    } else {
      setStatus('error');
      setErrorMessage('Unknown callback state — no success or error parameter received.');
    }
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-sm border text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-900">Connecting YouTube...</h2>
            <p className="text-sm text-gray-500 mt-2">Processing your authorization.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900">YouTube Connected</h2>
            <p className="text-sm text-gray-500 mt-2">
              Your YouTube account has been connected successfully. Redirecting to connections
              page...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900">Connection Failed</h2>
            <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
            <button
              onClick={() => router.push('/connections')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              Back to Connections
            </button>
          </>
        )}
      </div>
    </div>
  );
}
