# Xiaohongshu (小红书) Automated Server-Side Scraping Research
## Comprehensive Findings - April 2026

---

## EXECUTIVE SUMMARY

**Finding**: Fully automated server-side XHS scraping is **production-ready** and actively used by multiple mature projects. The key requirement is obtaining valid cookies (especially `a1`) and implementing request signing.

**Recommendation**: Move from browser extension to server-based architecture using either:
1. **xhshow-js** (TypeScript) - Pure algorithm, no browser needed
2. **MediaCrawler** (Python) - Most mature, battle-tested
3. **Rnote API** (Commercial) - Managed service, zero maintenance

---

## RESEARCH FINDINGS

### 1. NPM PACKAGE: xhshow-js

**Status**: ✅ **ACTIVE & MAINTAINED**

**Package Details**:
- **Name**: xhshow-js
- **Latest Version**: 1.0.0
- **Last Published**: 2026 (actively maintained)
- **Repository**: https://github.com/renmu123/xhshow-js
- **License**: MIT
- **Author**: renmu123
- **Maintainer**: renmu (renmu12345678@gmail.com)

**What It Does**:
Pure TypeScript implementation of XHS request signing. Generates all required headers for XHS API calls without needing a browser.

**Key Capabilities**:
- ✅ Generates `x-s` signature (main request signature)
- ✅ Generates `x-s-common` signature (cookie-based signature)
- ✅ Generates `x-t` (millisecond timestamp)
- ✅ Generates `x-b3-traceid` (16-char trace ID)
- ✅ Generates `x-xray-traceid` (32-char trace ID)
- ✅ Fingerprint generation (generateA1(), registerId())
- ✅ Browser-compatible (ESM + CommonJS)

**Dependencies**:
- Only `crypto-js` (v4.2.0+)
- No browser required
- Works in Node.js 16+

**Installation**:
```bash
npm install xhshow-js
```

**Basic Usage**:
```typescript
import { Client } from 'xhshow-js';

const client = new Client();
const a1 = 'your_a1_cookie_value';

// Generate x-s signature
const xs = client.signXS('GET', '/api/sns/web/v1/user_posted', a1, 'xhs-pc-web', {
  num: 30,
  user_id: '123'
});

// Generate other headers
const xt = client.getXT();
const b3TraceId = client.getB3TraceId();
const xsCommon = client.signXSCommon({ a1 });
```

**Evidence**: https://github.com/renmu123/xhshow-js/blob/main/src/client.ts

---

### 2. GITHUB REPOSITORY: MediaCrawler (NanmiCoder)

**Status**: ✅ **MOST MATURE PRODUCTION IMPLEMENTATION**

**Repository Details**:
- **URL**: https://github.com/NanmiCoder/MediaCrawler
- **Stars**: 48,274 ⭐
- **Forks**: 10,316
- **Last Push**: 2026-04-21 (TODAY - actively maintained)
- **Language**: Python
- **License**: NON-COMMERCIAL LEARNING LICENSE 1.1

**What It Does**:
Complete multi-platform crawler supporting Xiaohongshu, TikTok, Douyin, Kuaishou, Bilibili, Weibo, Baidu Tieba, and Zhihu. The XHS implementation is the most battle-tested.

**XHS-Specific Approach**:
1. **Browser Automation**: Playwright + stealth.js injection
2. **Cookie Extraction**: Automatic extraction from browser context
3. **Signing**: Pure algorithm using xhshow library (XYW_ format, post-March 2026)
4. **Proxy Support**: Built-in proxy rotation
5. **Fallback**: HTML extraction when API fails

**Cookie Requirements**:
- `a1` (mandatory) - Device/session ID
- `web_session` (optional) - User authentication
- `webId` (optional) - User ID

**Key Implementation Details**:

**Signing Algorithm** (from xhs_sign.py):
- Custom Base64 character table (XHS-specific shuffled order)
- CRC32 lookup table for x-s-common generation
- RC4 encryption for payload
- MD5 hashing for signature verification

**Evidence**: 
- Signing code: https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/xhs/xhs_sign.py
- Client code: https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/xhs/client.py

**Server-Side Viability**: ✅ **YES**
- Can run fully automated without user browser
- Handles both mainland (edith.xiaohongshu.com) and international (webapi.rednote.com)
- Includes anti-detection measures (stealth.js, proxy rotation)

---

### 3. CHROME EXTENSION PROJECTS

**Finding**: ⚠️ **LIMITED ACTIVE PROJECTS**

**Identified Project**:
- **Repository**: wanpengxie/xhs-chrome-release
- **URL**: https://github.com/wanpengxie/xhs-chrome-release
- **Stars**: 0
- **Last Push**: 2026-01-15 (3+ months old, inactive)
- **Description**: "xiaohongshu chrome extension"
- **Status**: ❌ **NOT ACTIVELY MAINTAINED**

**Why Chrome Extensions Are Less Common**:
1. **Signature Generation Complexity**: Extensions can't easily generate XYW_ signatures
2. **Cookie Access Limitations**: Browser extensions have limited cookie access
3. **Performance**: Passive interception is slower than active API calls
4. **Maintenance Burden**: XHS changes signatures frequently (XYS_ → XYW_ in March 2026)

**Recommendation**: If building an extension, use hybrid approach:
- Intercept fetch/XHR calls
- Send to background service for signing
- Inject signed headers back into request

---

### 4. SERVER-SIDE COOKIE REQUIREMENTS

**Minimum Required**:
- **a1**: MANDATORY
  - Device/session identifier
  - 56+ characters, alphanumeric
  - Validated on every request
  - Missing → HTTP 406 error
  - Invalid → Captcha trigger (HTTP 461/471)

- **web_session**: OPTIONAL but recommended
  - User authentication token
  - 32+ characters
  - Enables authenticated operations

- **webId**: OPTIONAL
  - User ID
  - 32+ characters (hex)

**How to Obtain Cookies**:

1. **Manual Extraction**:
   - User logs into XHS in browser
   - Open DevTools → Application → Cookies
   - Copy `a1`, `web_session`, `webId`

2. **Automated Extraction** (Playwright):
   ```python
   from playwright.async_api import async_playwright
   
   async with async_playwright() as p:
       browser = await p.chromium.launch()
       context = await browser.new_context()
       page = await context.new_page()
       await page.goto("https://www.xiaohongshu.com")
       # User logs in...
       cookies = await context.cookies()
       a1 = next(c['value'] for c in cookies if c['name'] == 'a1')
   ```

3. **QR Code Login** (xiaohongshu-cli):
   ```bash
   xhs login --qrcode
   # User scans with XHS app
   ```

4. **Cookie Jar Storage**:
   - Save to JSON file
   - Valid for 7 days
   - Auto-refresh from browser when expired

**Cookie Validation**:
- XHS validates `a1` on every request
- Expired cookies trigger automatic refresh (if browser available)
- Invalid cookies trigger captcha (HTTP 461/471)

---

### 5. OFFICIAL API ACCESS

**Xiaohongshu Official APIs**:

**Dandelion (蒲公英) - Creator Marketplace API**:
- **Access**: https://school.xiaohongshu.com/en/open/
- **Requirements**:
  - Business registration
  - Partnership approval
  - 2-4 weeks setup time
- **Limitations**:
  - Limited to brand accounts
  - Limited to verified businesses
  - Restricted endpoints
- **Endpoints**:
  - Creator profiles
  - Campaign management
  - Performance analytics
  - Order management

**Reality Check**: ❌ **NO PUBLIC/FREE API**
- XHS maintains strict access control
- Only enterprise partnerships get official API
- Web scraping is the de facto standard
- No legitimate way to access general content data programmatically

---

## COMPARATIVE ANALYSIS

| Feature | xhshow-js | MediaCrawler | xiaohongshu-cli | Rnote API |
|---------|-----------|--------------|-----------------|-----------|
| **Language** | TypeScript | Python | Python | Managed Service |
| **Browser Required** | ❌ No | ✅ Yes (Playwright) | ✅ Yes (for extraction) | ❌ No |
| **Pure Algorithm** | ✅ Yes | ✅ Yes | ✅ Yes | N/A |
| **Cookie Requirement** | a1 (required) | a1, web_session, webId | a1, web_session, webId | None (managed) |
| **Setup Complexity** | Low | Medium | Medium | Very Low |
| **Maintenance** | Low | Medium | Medium | None |
| **Cost** | Free | Free | Free | Paid |
| **Server-Side Ready** | ✅ YES | ✅ YES | ⚠️ Partial | ✅ YES |
| **Production Use** | ✅ Yes | ✅ Yes (48K stars) | ✅ Yes | ✅ Yes |
| **Last Updated** | 2026 | 2026-04-21 | 2026-03-08 | 2026-03-10 |

---

## RECOMMENDED ARCHITECTURE

### Option 1: Pure Algorithm (Recommended for Speed)
```
User Browser
    ↓
Extension (intercepts requests)
    ↓
Backend Service (xhshow-js signing)
    ↓
XHS API
```

**Pros**:
- No browser needed on server
- Fast, scalable
- Low latency

**Cons**:
- Need to obtain cookies initially
- Cookies expire every 7 days

### Option 2: Playwright-Based (Recommended for Reliability)
```
Backend Service
    ↓
Playwright Browser (automated)
    ↓
Cookie Extraction
    ↓
XHS API (with signing)
```

**Pros**:
- Fully automated
- Handles cookie refresh
- Anti-detection built-in

**Cons**:
- Requires browser resources
- Slower than pure algorithm

### Option 3: Managed Service (Recommended for Enterprise)
```
Your Application
    ↓
Rnote API (managed)
    ↓
XHS API (handled by service)
```

**Pros**:
- Zero maintenance
- Account pooling
- Risk control built-in

**Cons**:
- Paid service
- Less control

---

## IMPLEMENTATION CHECKLIST

### For xhshow-js (TypeScript):
- [ ] Install: `npm install xhshow-js`
- [ ] Obtain a1 cookie (manual or automated)
- [ ] Implement signing in backend
- [ ] Add request headers (x-s, x-s-common, x-t, x-b3-traceid)
- [ ] Handle HTTP 461/471 (captcha)
- [ ] Implement cookie refresh (7-day TTL)
- [ ] Add proxy rotation (optional but recommended)

### For MediaCrawler (Python):
- [ ] Clone: `git clone https://github.com/NanmiCoder/MediaCrawler`
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Configure XHS settings
- [ ] Set up Playwright browser
- [ ] Configure proxy (if needed)
- [ ] Run crawler

### For Rnote API (Commercial):
- [ ] Register at https://rnote.dev
- [ ] Create API Key
- [ ] Choose pricing tier
- [ ] Integrate SDK (Python/JS/TS/Java/Go/PHP)
- [ ] Start making requests

---

## CRITICAL NOTES

### Signature Format Evolution
- **Pre-March 2026**: XYS_ prefix (now rejected with HTTP 406)
- **March 2026+**: XYW_ prefix (AES-128-CBC encrypted)
- **Both xhshow-js and MediaCrawler support XYW_ format**

### Anti-Scraping Measures (2026)
- Device fingerprinting (Canvas, TLS/JA3)
- IP risk scoring (residential proxies recommended)
- Captcha triggers (HTTP 461/471)
- Rate limiting (adaptive, doubles after captcha)
- Headless detection (stealth.js injection required)
- User-Agent alignment (sec-ch-ua must match User-Agent)

### Rate Limiting
- Adaptive rate limiting
- Doubles after captcha trigger
- Gaussian jitter recommended (1-3 second delays)
- Progressive backoff on captcha

---

## CONCLUSION

**Server-side automated XHS scraping is production-ready and actively used.**

**Best Choice for Your Project**:
1. **If you need pure algorithm signing**: Use **xhshow-js** (TypeScript)
2. **If you need battle-tested implementation**: Use **MediaCrawler** (Python)
3. **If you need zero maintenance**: Use **Rnote API** (Commercial)

**Next Steps**:
1. Decide on architecture (pure algorithm vs. Playwright-based)
2. Implement cookie extraction mechanism
3. Add request signing
4. Implement anti-detection measures
5. Set up monitoring and error handling

---

## REFERENCES

- MediaCrawler: https://github.com/NanmiCoder/MediaCrawler
- xhshow-js: https://github.com/renmu123/xhshow-js
- xiaohongshu-cli: https://github.com/jackwener/xiaohongshu-cli
- ReaJason/xhs: https://github.com/ReaJason/xhs
- Rnote API: https://rnote.dev
- XHS Official API: https://school.xiaohongshu.com/en/open/

