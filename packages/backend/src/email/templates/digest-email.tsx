import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Hr,
  Preview,
} from '@react-email/components';
import * as React from 'react';

export interface DigestHeadlineProps {
  title: string;
  analysis: string;
  platform: string;
  original_url: string;
}

export interface DigestCategoryProps {
  topic: string;
  items: Array<{ one_liner: string; platform: string; original_url: string }>;
}

export interface DigestEmailProps {
  digestType: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  headlines: DigestHeadlineProps[];
  categories: DigestCategoryProps[];
  trendAnalysis: string;
  itemCount: number;
  appUrl?: string;
}

export function DigestEmail({
  digestType,
  periodStart,
  periodEnd,
  headlines,
  categories,
  trendAnalysis,
  itemCount,
  appUrl = 'https://app.omniclip.dev',
}: DigestEmailProps) {
  const title = digestType === 'daily' ? 'Daily Digest' : 'Weekly Digest';
  const dateRange = periodStart === periodEnd ? periodStart : `${periodStart} — ${periodEnd}`;

  return (
    <Html>
      <Head />
      <Preview>{`OmniClip ${title} — ${itemCount} items`}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
          <Heading as="h1" style={{ fontSize: 24 }}>
            OmniClip {title}
          </Heading>
          <Text style={{ color: '#6b7280' }}>
            {dateRange} · {itemCount} items
          </Text>

          {/* Headlines */}
          {headlines.length > 0 && (
            <Section>
              <Heading as="h2" style={{ fontSize: 18 }}>
                Headlines
              </Heading>
              {headlines.map((h, i) => (
                <Section key={i} style={{ marginBottom: 12 }}>
                  <Link href={h.original_url} style={{ fontWeight: 600, fontSize: 15 }}>
                    {h.title}
                  </Link>
                  <Text style={{ margin: '4px 0', fontSize: 14, color: '#374151' }}>
                    {h.analysis}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>{h.platform}</Text>
                </Section>
              ))}
            </Section>
          )}

          <Hr />

          {/* Categories */}
          {categories.map((cat, i) => (
            <Section key={i}>
              <Heading as="h3" style={{ fontSize: 16 }}>
                {cat.topic}
              </Heading>
              {cat.items.map((item, j) => (
                <Text key={j} style={{ fontSize: 14, margin: '4px 0' }}>
                  • <Link href={item.original_url}>{item.one_liner}</Link>
                  <span style={{ color: '#9ca3af' }}> ({item.platform})</span>
                </Text>
              ))}
            </Section>
          ))}

          {/* Trend Analysis */}
          {trendAnalysis && (
            <Section>
              <Hr />
              <Heading as="h3" style={{ fontSize: 16 }}>
                Trend Analysis
              </Heading>
              <Text style={{ fontSize: 14, color: '#374151' }}>{trendAnalysis}</Text>
            </Section>
          )}

          <Hr />
          <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' as const }}>
            <Link href={appUrl}>View in app</Link> ·{' '}
            <Link href={`${appUrl}/settings`}>Manage notifications</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
