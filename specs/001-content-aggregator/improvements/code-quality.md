# Code Quality Improvements - OmniClip Content Aggregator

**Created**: 2026-04-10  
**Status**: 🟢 Enhancement  
**Priority**: P2 (Nice to have)

---

## 1. Abstract Extension Connector Duplication

### Current State

Twitter and Xiaohongshu connectors are nearly identical:

```typescript
// twitter.connector.ts
@Injectable()
export class TwitterConnector implements PlatformConnector {
  readonly platform = 'twitter';
  readonly type = 'extension';
  // ...
}

// xiaohongshu.connector.ts
@Injectable()
export class XiaohongshuConnector implements PlatformConnector {
  readonly platform = 'xiaohongshu';
  readonly type = 'extension';
  // Same implementation!
}
```

### Refactoring Strategy

Create a base class for extension-based connectors:

```typescript
// connectors/base/extension-base.connector.ts
export abstract class ExtensionBaseConnector implements PlatformConnector {
  abstract readonly platform: PlatformId;
  readonly type = 'extension';

  constructor(
    protected connectionsService: ConnectionsService,
    protected contentService: ContentService,
  ) {}

  async healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult> {
    const minutesSinceSync = this.getMinutesSinceSync(connection.lastSyncAt);
    const maxAcceptableDelay = connection.syncIntervalMinutes * 2;

    if (minutesSinceSync > maxAcceptableDelay && connection.status === 'active') {
      return {
        status: 'warning',
        message: `No sync in ${Math.floor(minutesSinceSync)} minutes`,
        retryable: true,
      };
    }

    return { status: 'healthy' };
  }

  async fetchContent(): Promise<FetchResult> {
    return {
      items: [],
      hasMore: false,
    };
  }

  abstract parseResponse(rawData: unknown): ContentItemInput[];

  private getMinutesSinceSync(lastSyncAt: Date | null): number {
    if (!lastSyncAt) return Infinity;
    return (Date.now() - lastSyncAt.getTime()) / (1000 * 60);
  }
}

// Refactored connectors
@Injectable()
export class TwitterConnector extends ExtensionBaseConnector {
  readonly platform = 'twitter';

  parseResponse(rawData: unknown): ContentItemInput[] {
    return this.parseTwitterPayload(rawData);
  }

  private parseTwitterPayload(data: any): ContentItemInput[] {
    // Platform-specific parsing only
  }
}

@Injectable()
export class XiaohongshuConnector extends ExtensionBaseConnector {
  readonly platform = 'xiaohongshu';

  parseResponse(rawData: unknown): ContentItemInput[] {
    return this.parseXiaohongshuPayload(rawData);
  }

  private parseXiaohongshuPayload(data: any): ContentItemInput[] {
    // Platform-specific parsing only
  }
}
```

### Benefits

- DRY principle: Shared logic in one place
- Easier maintenance: Fix bugs once
- Adding new extension platforms: Just implement `parseResponse`

### Files to Modify

- Create: `packages/backend/src/connectors/base/extension-base.connector.ts`
- Refactor: `packages/backend/src/connectors/twitter/twitter.connector.ts`
- Refactor: `packages/backend/src/connectors/xiaohongshu/xiaohongshu.connector.ts`

---

## 2. Centralize Magic Numbers

### Current State

Numbers scattered throughout codebase:

```typescript
// sync-buffer.ts
const BUFFER_LIMIT = 500;
const MAX_RETRIES = 5;

// api-sync.processor.ts
const BATCH_SIZE = 100;

// digest.service.ts
const MIN_ITEMS_FOR_GROUPING = 5;
const MAX_CONTENT_LENGTH = 8000;
```

### Refactoring Strategy

```typescript
// shared/constants/platform-limits.ts
export const PLATFORM_LIMITS = {
  github: {
    apiRequestsPerHour: 5000,
    itemsPerPage: 100,
    maxConcurrentRequests: 10,
  },
  youtube: {
    dailyQuota: 10000,
    itemsPerRequest: 50,
    tokenRefreshThresholdMinutes: 5,
  },
  extension: {
    bufferLimit: 500,
    syncIntervalMinutes: 30,
    maxRetries: 5,
    retryBackoffBaseMs: 60000,
  },
} as const;

// shared/constants/content-limits.ts
export const CONTENT_LIMITS = {
  maxTitleLength: 500,
  maxBodyLength: 50000,
  maxMediaUrls: 20,
  maxMetadataSize: 10000,
  retentionDaysDefault: 90,
} as const;

// shared/constants/ai-limits.ts
export const AI_LIMITS = {
  minItemsForGrouping: 5,
  maxContentLengthPerItem: 8000,
  maxItemsPerBatch: 20,
  maxConcurrentGenerations: 5,
} as const;

// shared/constants/sync-limits.ts
export const SYNC_LIMITS = {
  batchSize: 100,
  maxSyncAgeHours: 48,
  defaultIntervalMinutes: 60,
} as const;
```

### Benefits

- Single source of truth
- Easy to adjust limits
- Self-documenting code

---

## 3. Add Frontend Test Coverage

### Current State

- Backend: 24 test files ✅
- Frontend: Minimal test coverage ❌
- Extension: Parser tests only

### Test Strategy

```typescript
// frontend/tests/unit/hooks/useAuth.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';

describe('useAuth', () => {
  it('should redirect to login when token expires', async () => {
    // Test implementation
  });

  it('should refresh token before expiration', async () => {
    // Test implementation
  });
});

// frontend/tests/unit/components/FeedCard.test.tsx
describe('FeedCard', () => {
  it('renders GitHub release correctly', () => {
    const item = mockContentItem({ platform: 'github', type: 'release' });
    render(<FeedCard item={item} />);
    expect(screen.getByText(item.title)).toBeInTheDocument();
  });

  it('truncates long content', () => {
    // Test truncation logic
  });
});

// frontend/tests/e2e/connections.spec.ts (Playwright)
test('user can connect GitHub account', async ({ page }) => {
  await page.goto('/connections');
  await page.click('[data-testid="add-github"]');
  await page.fill('[name="token"]', 'ghp_test_token');
  await page.click('[type="submit"]');
  await expect(page.locator('[data-testid="connection-status"]')).
    toHaveText('Connected');
});
```

### Test Files to Create

```
frontend/tests/
├── unit/
│   ├── hooks/
│   │   ├── useAuth.test.ts
│   │   ├── useContent.test.ts
│   │   └── useConnections.test.ts
│   ├── components/
│   │   ├── FeedCard.test.tsx
│   │   ├── ConnectionCard.test.tsx
│   │   └── DigestCard.test.tsx
│   └── lib/
│       ├── api-client.test.ts
│       └── utils.test.ts
└── e2e/
    ├── auth.spec.ts
    ├── connections.spec.ts
    ├── feed.spec.ts
    └── digest.spec.ts
```

---

## 4. Unified Error Handling

### Current State

- HTTP exceptions in controllers
- Connector errors in connectors
- Inconsistent error formats

### Refactoring Strategy

```typescript
// shared/types/errors.ts
export enum ErrorCode {
  // Auth
  AUTH_INVALID_CREDENTIALS = 'AUTH_001',
  AUTH_TOKEN_EXPIRED = 'AUTH_002',
  AUTH_UNAUTHORIZED = 'AUTH_003',

  // Connection
  CONN_NOT_FOUND = 'CONN_001',
  CONN_PLATFORM_ERROR = 'CONN_002',
  CONN_AUTH_EXPIRED = 'CONN_003',

  // Content
  CONTENT_NOT_FOUND = 'CONTENT_001',
  CONTENT_RATE_LIMITED = 'CONTENT_002',

  // Sync
  SYNC_FAILED = 'SYNC_001',
  SYNC_RATE_LIMITED = 'SYNC_002',

  // AI
  AI_GENERATION_FAILED = 'AI_001',
  AI_QUOTA_EXCEEDED = 'AI_002',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

// backend/common/filters/app-exception.filter.ts
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const error = this.normalizeError(exception);

    response.status(this.getStatusCode(error.code)).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        retryable: error.retryable,
      },
    });
  }

  private normalizeError(exception: unknown): AppError {
    if (exception instanceof ConnectorError) {
      return {
        code: this.mapConnectorError(exception.code),
        message: exception.message,
        retryable: exception.retryable,
      };
    }

    if (exception instanceof HttpException) {
      // Map HTTP exceptions
    }

    // Default
    return {
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'An unexpected error occurred',
      retryable: false,
    };
  }
}
```

### Benefits

- Consistent error format across API
- Frontend can handle errors programmatically by code
- Better debugging with structured errors

---

## 5. API Documentation

### Implementation

Add OpenAPI/Swagger documentation:

```typescript
// backend/main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('OmniClip API')
  .setDescription('Multi-platform content aggregator API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

### Controller Documentation

```typescript
@ApiTags('Content')
@Controller('content')
export class ContentController {
  @Get()
  @ApiOperation({ summary: 'Get user content feed' })
  @ApiQuery({ name: 'platform', required: false, enum: PlatformId })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: ContentFeedResponse })
  async getFeed(@Query() query: FeedQueryDto) {
    // Implementation
  }
}
```

---

## 6. Code Style Improvements

### Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "avoid"
}
```

### ESLint Configuration

```javascript
// eslint.config.js
export default [
  // ...existing config
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
];
```

---

## Implementation Priority

1. **P2-High**: Abstract ExtensionBaseConnector (reduces duplication)
2. **P2-High**: Add frontend test coverage (critical for stability)
3. **P2-Medium**: Centralize magic numbers
4. **P2-Medium**: Unified error handling
5. **P2-Low**: API documentation (Swagger)
6. **P2-Low**: Code style enforcement (ESLint/Prettier)

---

## Quality Metrics

Target metrics after improvements:

- Test coverage: Backend 80%+, Frontend 60%+
- Code duplication: < 5%
- Lint errors: 0
- Type safety: No `any` types
- Documentation: All public APIs documented
