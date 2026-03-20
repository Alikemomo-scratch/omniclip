import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <h1 className="text-5xl font-bold text-gray-900">OmniClip</h1>
      <p className="mt-4 text-xl text-gray-600 mb-8 text-center max-w-lg">
        Your Personal Information Anchor. Break the information cocoon and track only the
        high-signal content you care about.
      </p>

      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="px-6 py-3 bg-white text-blue-600 border border-blue-600 font-medium rounded-lg hover:bg-blue-50 transition shadow-sm"
        >
          Create Account
        </Link>
      </div>
    </main>
  );
}
