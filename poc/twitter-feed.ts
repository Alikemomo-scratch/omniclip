/**
 * OmniClip POC — Twitter/X Following Feed Fetcher
 *
 * Usage:
 *   cp .env.example .env   # fill in TWITTER_API_KEY (or auth_token + ct0)
 *   npm install
 *   npm run twitter
 *
 * Requires Node >= 22.21.0 (rettiwt-api v7 dependency)
 */

import 'dotenv/config';
import { Rettiwt } from 'rettiwt-api';

const TWITTER_API_KEY = process.env.TWITTER_API_KEY ?? '';
const TWITTER_AUTH_TOKEN = process.env.TWITTER_AUTH_TOKEN ?? '';
const TWITTER_CT0 = process.env.TWITTER_CT0 ?? '';

function die(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

/**
 * Construct an API key from raw cookies. The rettiwt-api API_KEY is
 * base64-encoded cookie jar entries — format reverse-engineered from
 * the X Auth Helper extension source.
 */
function buildApiKeyFromCookies(authToken: string, ct0: string): string {
  const cookies = [
    { name: 'auth_token', value: authToken, domain: '.x.com', path: '/' },
    { name: 'ct0', value: ct0, domain: '.x.com', path: '/' },
  ];
  return Buffer.from(JSON.stringify(cookies)).toString('base64');
}

async function main(): Promise<void> {
  let apiKey = TWITTER_API_KEY;

  if (!apiKey || apiKey === 'your_base64_api_key_here') {
    if (TWITTER_AUTH_TOKEN && TWITTER_CT0) {
      console.log('🔧 No API_KEY found. Constructing from auth_token + ct0...');
      apiKey = buildApiKeyFromCookies(TWITTER_AUTH_TOKEN, TWITTER_CT0);
      console.log('🔑 Constructed API_KEY:', apiKey.slice(0, 20) + '...');
      console.log('');
      console.log('⚠️  Note: If this fails, use the X Auth Helper browser extension');
      console.log('   to generate a proper API_KEY instead.');
      console.log('');
    } else {
      die(
        'No Twitter credentials found.\n' +
        '  Option A: Set TWITTER_API_KEY (recommended — use X Auth Helper extension)\n' +
        '  Option B: Set TWITTER_AUTH_TOKEN + TWITTER_CT0 (fallback)\n' +
        '  See .env.example for details.'
      );
    }
  } else {
    console.log('🔑 Using provided API_KEY:', apiKey.slice(0, 20) + '...');
  }

  console.log('\n🐦 Initializing Rettiwt client...');

  const rettiwt = new Rettiwt({
    apiKey,
    logging: false,
  });

  console.log('📋 Verifying credentials (fetching own user details)...');

  try {
    const me = await rettiwt.user.details();
    if (me) {
      console.log(`\n✅ Authenticated as: @${me.userName} (${me.fullName})`);
      console.log(`   Followers: ${me.followersCount} | Following: ${me.followingsCount}`);
    } else {
      console.log('\n⚠️  user.details() returned null — credentials may be invalid.');
    }
  } catch (err) {
    console.error('\n⚠️  Failed to verify credentials:', err instanceof Error ? err.message : err);
    console.error('   Continuing anyway — the API key format may differ for user.details()...\n');
  }

  console.log('\n📰 Fetching "Following" feed...');

  try {
    const feed = await rettiwt.user.followed();

    if (!feed || !feed.list || feed.list.length === 0) {
      console.log('\n⚠️  Feed returned empty. This could mean:');
      console.log('   - The API key is valid but the account follows nobody');
      console.log('   - The API key format is incorrect for this endpoint');
      console.log('   - Twitter rate-limited this request');

      if (feed) {
        console.log('\n📦 Raw feed object keys:', Object.keys(feed));
      }
      return;
    }

    console.log(`\n✅ Got ${feed.list.length} tweets from Following feed!\n`);

    for (const tweet of feed.list.slice(0, 10)) {
      const createdAt = tweet.createdAt
        ? new Date(tweet.createdAt).toLocaleString()
        : 'unknown';
      console.log(`  ─ @${tweet.tweetBy?.userName ?? 'unknown'} (${createdAt})`);
      console.log(`    ${(tweet.fullText ?? '').slice(0, 280)}`);
      console.log(`    ❤️ ${tweet.likeCount ?? 0} | 🔁 ${tweet.retweetCount ?? 0} | 💬 ${tweet.replyCount ?? 0}`);
      if (tweet.media?.length) {
        console.log(`    📎 Media: ${tweet.media.length} item(s)`);
      }
      if (tweet.urls?.length) {
        console.log(`    🔗 ${tweet.urls.map(u => u.expandedUrl ?? u.url).join(', ')}`);
      }
      console.log('');
    }

    if (feed.next) {
      console.log(`📌 Cursor for next page: ${feed.next.slice(0, 40)}...`);
    }

    console.log('🎉 Twitter POC validation complete.');
  } catch (err) {
    console.error('\n💥 Failed to fetch Following feed:');
    if (err instanceof Error) {
      console.error('   Error:', err.message);
      if (err.message.includes('403') || err.message.includes('401')) {
        console.error('\n🔒 Authentication failed. Your API key may be expired or invalid.');
        console.error('   Regenerate it with the X Auth Helper browser extension.');
      }
    } else {
      console.error('   Error:', err);
    }
    process.exit(1);
  }
}

main();
