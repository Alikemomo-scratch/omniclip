# Critical Issues - OmniClip Content Aggregator

**Created**: 2026-04-10  
**Status**: 🔴 Blocker - Must Fix Before Production  
**Priority**: P0

---

## Issue 1: Missing Database Migration Files

### Problem

- `drizzle.config.ts` exists at repo root
- Schema definitions exist in `packages/backend/src/common/database/schema/`
- **No migration files** in `packages/backend/drizzle/migrations/`
- RLS policies are defined in `data-model.md` but not in actual SQL migrations

### Impact

- New environments cannot initialize database
- RLS (Row-Level Security) relies solely on application layer
- No version-controlled schema changes

### Solution

```bash
# 1. Generate migrations
pnpm --filter backend db:generate

# 2. Create RLS migration manually (packages/backend/drizzle/migrations/0001_rls_policies.sql):
```

```sql
-- Enable RLS on all user-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for content_items (example)
CREATE POLICY content_items_isolation ON content_items
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id')::uuid);

-- Repeat for other tables...
```

### Files to Modify

- Create: `packages/backend/drizzle/migrations/` directory
- Create: Initial migration files

---

## Issue 2: Encryption Key Default Fallback

### Problem

**Location**: `packages/backend/src/common/utils/encryption.util.ts:4`

```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-32-chars-long!!';
```

### Impact

- Production deployments may forget to set `ENCRYPTION_KEY`
- Data encrypted with predictable default key
- Security breach: attacker can decrypt all stored credentials if they know the default

### Solution

```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  throw new Error(
    'ENCRYPTION_KEY environment variable is required. ' +
      "Generate a secure key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

if (ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}
```

### Files to Modify

- `packages/backend/src/common/utils/encryption.util.ts`
- `packages/backend/.env.example` - Add ENCRYPTION_KEY with comment

---

## Issue 3: OAuth State Parameter Security

### Problem

**Location**: `packages/backend/src/auth/youtube-oauth.controller.ts`

```typescript
const state = userId; // ❌ Raw userId used as state
```

### Impact

- CSRF attack vulnerability
- Attacker can forge OAuth callback with victim's userId
- State parameter should be unguessable and signed

### Solution

```typescript
// 1. Generate signed state token
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';

const generateState(userId: string): string {
  const nonce = randomBytes(32).toString('hex');
  return this.jwtService.sign(
    { userId, nonce },
    { expiresIn: '10m', secret: process.env.OAUTH_STATE_SECRET }
  );
}

// 2. Verify state on callback
const verifyState(state: string): { userId: string } {
  try {
    return this.jwtService.verify(state, {
      secret: process.env.OAUTH_STATE_SECRET
    });
  } catch {
    throw new UnauthorizedException('Invalid OAuth state');
  }
}
```

### Files to Modify

- `packages/backend/src/auth/youtube-oauth.controller.ts`
- `packages/backend/.env.example` - Add OAUTH_STATE_SECRET

---

## Issue 4: Extension Icons Missing

### Problem

**Location**: `packages/extension/src/manifest.json`

```json
{
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

But `packages/extension/src/icons/` directory does not exist.

### Impact

- Chrome Web Store submission will be rejected
- Extension appears broken in Chrome toolbar (no icon)

### Solution

1. Create icon assets (16x16, 48x48, 128x128 PNG)
2. Place in `packages/extension/src/icons/`
3. Ensure Vite build copies icons to dist

### Files to Create

- `packages/extension/src/icons/icon16.png`
- `packages/extension/src/icons/icon48.png`
- `packages/extension/src/icons/icon128.png`

**Note**: Icons should be simple, recognizable design. Consider using OmniClip logo or letter "O".

---

## Verification Checklist

Before claiming these issues are resolved:

- [ ] Run `pnpm --filter backend db:migrate` successfully on fresh database
- [ ] Verify RLS policies exist: `\d+ content_items` in psql shows policies
- [ ] Unset ENCRYPTION_KEY, backend should throw error on startup
- [ ] YouTube OAuth flow works end-to-end
- [ ] Extension loads in Chrome with visible icon
- [ ] All tests pass: `pnpm test`

---

## Timeline

**Target**: Fix within 1-2 days  
**Owner**: TBD  
**Reviewer**: Required before production deployment
