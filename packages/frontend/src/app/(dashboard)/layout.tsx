'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authApi } from '@/lib/api-client';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslations } from 'next-intl';

const navItems = [
  { href: '/feed', labelKey: 'feed' },
  { href: '/digests', labelKey: 'digests' },
  { href: '/connections', labelKey: 'connections' },
  { href: '/settings', labelKey: 'settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations('Navigation');

  // Proactive auth guard — redirect to login if no token is present.
  // This prevents rendering dashboard pages for unauthenticated users
  // before any API call triggers the reactive 401 handler.
  useEffect(() => {
    if (!authApi.isAuthenticated()) {
      window.location.href = '/login';
    }
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 flex justify-between items-center">
          <h1 className="text-xl font-bold">OmniClip</h1>
          <LanguageSwitcher />
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {t(item.labelKey as any)}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => authApi.logout()}
            className="w-full px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors text-left"
          >
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
