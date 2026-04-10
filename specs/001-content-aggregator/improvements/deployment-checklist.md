# Deployment Checklist - OmniClip Content Aggregator

**Created**: 2026-04-10  
**Version**: 1.0  
**Environment**: Production

---

## Pre-Deployment Requirements

### Infrastructure

- [ ] **Server**: Linux server (Ubuntu 22.04 LTS recommended)
- [ ] **Node.js**: Version 20 LTS installed
- [ ] **pnpm**: Version 9.x installed globally
- [ ] **Docker**: 24.x+ with Docker Compose
- [ ] **PostgreSQL**: 16.x (via Docker or managed service)
- [ ] **Redis**: 7.x (via Docker or managed service)
- [ ] **Domain**: Registered domain with SSL certificate
- [ ] **Reverse Proxy**: Nginx or Traefik configured

---

## Environment Variables

### Backend (`.env`)

```bash
# Database (Required)
DATABASE_URL=postgresql://user:password@localhost:5432/omniclip_prod

# Redis (Required)
REDIS_URL=redis://localhost:6379/0

# JWT Secrets (Required - Generate strong secrets)
JWT_SECRET=              # min 64 chars, random
JWT_REFRESH_SECRET=      # different from JWT_SECRET

# Encryption (Required - 64 hex chars)
ENCRYPTION_KEY=          # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OAuth State (Required)
OAUTH_STATE_SECRET=      # min 32 chars, random

# AI Services (At least one required)
OPENAI_API_KEY=          # sk-...
GEMINI_API_KEY=          # AIza...

# YouTube OAuth (Optional, for YouTube support)
YOUTUBE_CLIENT_ID=       # ...apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=   # ...
YOUTUBE_REDIRECT_URI=    # https://yourdomain.com/api/v1/auth/youtube/callback

# Server (Required)
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com

# Logging (Optional)
LOG_LEVEL=info
LOG_FORMAT=json
```

**Verification Commands**:

```bash
# Check all required vars are set
grep -E "^(DATABASE_URL|REDIS_URL|JWT_SECRET|ENCRYPTION_KEY)=" packages/backend/.env | wc -l
# Should output: 4

# Verify ENCRYPTION_KEY length
node -e "console.log(process.env.ENCRYPTION_KEY?.length === 64)"
```

### Frontend (`.env`)

```bash
# API Endpoint (Required)
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1

# Environment (Required)
NODE_ENV=production
```

---

## Deployment Steps

### 1. Database Setup

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Verify services are healthy
docker-compose ps
pg_isready -h localhost -p 5432
redis-cli ping  # Should return PONG
```

### 2. Database Migration

```bash
# Generate migrations (if not exists)
pnpm --filter backend db:generate

# Run migrations
pnpm --filter backend db:migrate

# Verify schema
psql $DATABASE_URL -c "\dt"
```

### 3. Application Build

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Build all packages
pnpm build

# Verify builds
ls packages/backend/dist/main.js
ls packages/frontend/.next/
ls packages/extension/dist/manifest.json
```

### 4. Start Services

```bash
# Start backend (using PM2 recommended)
pm install -g pm2
pm2 start packages/backend/dist/main.js --name omniclip-backend

# Or with environment
pm2 start packages/backend/dist/main.js \
  --name omniclip-backend \
  --env production

# Verify backend
 curl https://yourdomain.com/api/v1/health
# Expected: {"status":"ok"}

# Start frontend (or use Vercel/Netlify)
cd packages/frontend
pnpm start
```

### 5. Extension Packaging

```bash
# Build extension
cd packages/extension
pnpm build

# Verify manifest
cat dist/manifest.json

# Package for Chrome Web Store
cd dist
zip -r omniclip-extension-v1.0.0.zip .

# Upload to Chrome Web Store Developer Dashboard
# https://chrome.google.com/webstore/devconsole
```

---

## Configuration Verification

### Security Checklist

- [ ] **HTTPS Only**: All endpoints use HTTPS
- [ ] **CORS**: Origins restricted to production domain
- [ ] **Secrets**: No default values in production
- [ ] **Database**: SSL enabled for PostgreSQL
- [ ] **Redis**: AUTH password configured
- [ ] **Rate Limiting**: Enabled
- [ ] **Headers**: Security headers configured (HSTS, CSP, X-Frame-Options)

### Security Headers (Nginx)

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;
```

### Database Verification

```sql
-- Check RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('users', 'platform_connections', 'content_items', 'digests');
-- All should show relrowsecurity = true

-- Check indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'content_items';
-- Should see: idx_ci_dedup, idx_ci_feed, idx_ci_platform_date
```

---

## Monitoring Setup

### Application Logs

```bash
# View backend logs
pm2 logs omniclip-backend

# Structured logging verification
pm2 logs omniclip-backend | grep "ERROR"
# Should see structured JSON errors
```

### Health Checks

```bash
# Backend health
curl -f https://yourdomain.com/api/v1/health || echo "FAIL"

# Database health
curl -f https://yourdomain.com/api/v1/health/db || echo "FAIL"

# Queue health
curl -f https://yourdomain.com/api/v1/health/queues || echo "FAIL"
```

### BullMQ Dashboard (Development Only)

```bash
# Access at: https://yourdomain.com/admin/queues
# Enable only in development or with strong auth
```

### Recommended Monitoring Stack

- **Metrics**: Prometheus + Grafana
- **Logging**: Loki or ELK Stack
- **Errors**: Sentry
- **Uptime**: UptimeRobot or Pingdom

---

## Post-Deployment Verification

### End-to-End Tests

```bash
# 1. User Registration
curl -X POST https://yourdomain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","displayName":"Test User"}'

# 2. Login
curl -X POST https://yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# 3. Create GitHub Connection
curl -X POST https://yourdomain.com/api/v1/connections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"github","authData":{"token":"ghp_..."}}'

# 4. Check Feed
curl https://yourdomain.com/api/v1/content \
  -H "Authorization: Bearer $TOKEN"
```

### Manual Verification

- [ ] **Frontend**: Load https://yourdomain.com, register/login works
- [ ] **Connections**: Can add GitHub connection
- [ ] **Sync**: Content appears in feed after sync
- [ ] **Extension**: Install from Chrome Web Store, login works
- [ ] **Digest**: Generate digest manually, completes successfully

---

## Rollback Plan

### Database Rollback

```bash
# List migrations
pnpm --filter backend db:migrate:status

# Rollback one migration
pnpm --filter backend db:migrate:down
```

### Application Rollback

```bash
# Rollback to previous version
pm2 stop omniclip-backend
git checkout <previous-tag>
pnpm build
pm2 start omniclip-backend
```

### Database Backup (Before Deploy)

```bash
# Create backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Upload to S3 or secure storage
aws s3 cp backup-*.sql s3://omniclip-backups/
```

---

## Troubleshooting

### Common Issues

**1. Database Connection Failed**

```bash
# Check PostgreSQL is running
docker-compose ps

# Check connection string
psql $DATABASE_URL -c "SELECT 1"
```

**2. Migration Failed**

```bash
# Check migration status
pnpm --filter backend db:migrate:status

# Reset and re-run (CAUTION: Data loss)
pnpm --filter backend db:drop
pnpm --filter backend db:migrate
```

**3. Extension Not Loading**

```bash
# Check manifest is valid
cat packages/extension/dist/manifest.json | jq .

# Check icons exist
ls packages/extension/dist/icons/
```

**4. AI Digest Not Working**

```bash
# Check API key is set
grep "OPENAI_API_KEY\|GEMINI_API_KEY" packages/backend/.env

# Check logs for AI errors
pm2 logs omniclip-backend | grep -i "digest\|ai\|openai"
```

---

## Sign-Off

**Deployment Date**: ******\_\_\_******  
**Deployed By**: ******\_\_\_******  
**Version**: ******\_\_\_******

### Final Checks

- [ ] All environment variables set
- [ ] Database migrated and RLS enabled
- [ ] Application builds without errors
- [ ] All services started and healthy
- [ ] Extension uploaded to Chrome Web Store
- [ ] End-to-end tests pass
- [ ] Monitoring configured
- [ ] Rollback plan tested
- [ ] Documentation updated

**Approved for Production**: ☐ Yes ☐ No  
**Notes**: ******\_\_\_******
