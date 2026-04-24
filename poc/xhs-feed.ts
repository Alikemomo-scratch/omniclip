/**
 * OmniClip POC — XHS (Xiaohongshu) Feed Fetcher
 *
 * Usage:
 *   cp .env.example .env   # paste full cookie string into XHS_COOKIES
 *   npm install
 *   npm run xhs
 */

import 'dotenv/config';
import { Client, PUBLIC_USER_AGENT } from 'xhshow-js';

const XHS_COOKIES = process.env.XHS_COOKIES ?? '';

const API_HOST = 'https://edith.xiaohongshu.com';
const FEED_URI = '/api/sns/web/v1/feed';

const USER_AGENT = PUBLIC_USER_AGENT;

function die(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function extractCookie(name: string): string {
  const match = XHS_COOKIES.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? '';
}

async function main(): Promise<void> {
  if (!XHS_COOKIES || XHS_COOKIES === 'your_full_cookie_string_here') {
    die(
      'XHS_COOKIES is not set.\n' +
      '  1. Open xiaohongshu.com → F12 → Network\n' +
      '  2. Find any request to edith.xiaohongshu.com\n' +
      '  3. Copy the Cookie header value\n' +
      '  4. Paste into .env as XHS_COOKIES=...'
    );
  }

  const a1 = extractCookie('a1');
  if (!a1) die('Could not find "a1" in your cookie string.');

  const webSession = extractCookie('web_session');

  console.log('🔑 Cookies loaded (%d chars)', XHS_COOKIES.length);
  console.log('  a1:', a1.slice(0, 12) + '...');
  if (webSession) console.log('  web_session:', webSession.slice(0, 12) + '...');

  const client = new Client();

  const payload = {
    source_note_id: '',
    image_formats: ['jpg', 'webp', 'avif'],
    extra: { need_body_topic: '1' },
    xsec_source: 'pc_feed',
  };

  const cookies = {
    a1,
    ...(webSession ? { web_session: webSession } : {}),
  };

  const xs = client.signXS('POST', FEED_URI, a1, 'xhs-pc-web', payload);
  const xt = client.getXT();
  const b3 = client.getB3TraceId();
  const xray = client.getXrayTraceId();
  const xsCommon = client.signXSCommon(cookies);

  console.log('\n📝 Signatures:');
  console.log('  x-s:', xs.slice(0, 30) + '...');
  console.log('  x-t:', xt);

  const url = `${API_HOST}${FEED_URI}`;
  console.log(`\n🌐 POST ${url}`);

  // sec-ch-ua must align with User-Agent version to avoid fingerprint mismatch
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'User-Agent': USER_AGENT,
    Cookie: XHS_COOKIES,
    Origin: 'https://www.xiaohongshu.com',
    Referer: 'https://www.xiaohongshu.com/',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'sec-ch-ua': '"Chromium";v="142", "Not_A Brand";v="24", "Microsoft Edge";v="142"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'x-s': xs,
    'x-t': String(xt),
    'x-b3-traceid': b3,
    'x-xray-traceid': xray,
    'x-s-common': xsCommon,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    console.log(`\n📬 Response: ${res.status} ${res.statusText}`);

    const body = await res.text();

    if (!res.ok) {
      console.error('\n⚠️  Non-2xx response body:');
      console.error(body.slice(0, 2000));

      if (res.status === 461 || res.status === 471) {
        console.error('\n🔒 Captcha triggered. Possible causes:');
        console.error('   - Cookies expired (re-extract full cookie string from browser)');
        console.error('   - IP flagged (try from a different network)');
        console.error('   - Request velocity too high (wait and retry)');
      } else if (res.status === 406) {
        console.error('\n🔒 406 — signature format rejected. xhshow-js may need updating.');
      }
      process.exit(1);
    }

    const data = JSON.parse(body);
    console.log('\n✅ Success! Response structure:');
    console.log('  Top-level keys:', Object.keys(data));

    if (data.data?.items) {
      const items = data.data.items;
      console.log(`  Feed items: ${items.length}`);
      console.log('\n📰 First 3 items:');
      for (const item of items.slice(0, 3)) {
        const note = item.note_card ?? item;
        console.log(`  ─ [${note.type ?? 'unknown'}] ${note.display_title ?? note.title ?? '(no title)'}`);
        console.log(`    id: ${note.note_id ?? item.id ?? 'N/A'}`);
        console.log(`    user: ${note.user?.nickname ?? 'N/A'}`);
        if (note.interact_info) {
          console.log(
            `    likes: ${note.interact_info.liked_count ?? '?'} | ` +
            `comments: ${note.interact_info.comment_count ?? '?'}`
          );
        }
        console.log('');
      }
    } else {
      console.log('\n📦 Raw response (first 1000 chars):');
      console.log(JSON.stringify(data, null, 2).slice(0, 1000));
    }

    console.log('🎉 XHS POC validation complete.');
  } catch (err) {
    console.error('\n💥 Request failed:', err);
    process.exit(1);
  }
}

main();
