'use client';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const handleLocaleChange = (newLocale: string) => {
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <select
      value={locale}
      onChange={(e) => handleLocaleChange(e.target.value)}
      className="bg-gray-100 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 block p-2"
    >
      <option value="en">English</option>
      <option value="zh">中文</option>
    </select>
  );
}
