import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';

export const metadata: Metadata = {
  title: 'OmniClip - Content Aggregator',
  description: 'Multi-platform content aggregation dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
