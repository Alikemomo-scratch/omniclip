import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorError } from './interfaces/connector-error';
import type {
  PlatformConnector,
  PlatformConnectionData,
  HealthCheckResult,
  FetchResult,
  ContentItemInput,
} from '@omniclip/shared';

/**
 * A mock connector for testing the registry.
 */
class MockGitHubConnector implements PlatformConnector {
  readonly platform = 'github' as const;
  readonly type = 'api' as const;

  async healthCheck(_connection: PlatformConnectionData): Promise<HealthCheckResult> {
    return { status: 'healthy', message: 'OK' };
  }

  async fetchContent(
    _connection: PlatformConnectionData,
    _since: Date | null,
  ): Promise<FetchResult> {
    return {
      items: [],
      has_more: false,
      metadata: { api_calls_made: 1 },
    };
  }

  parseResponse(_rawData: unknown): ContentItemInput[] {
    return [];
  }
}

class MockYouTubeConnector implements PlatformConnector {
  readonly platform = 'youtube' as const;
  readonly type = 'api' as const;

  async healthCheck(_connection: PlatformConnectionData): Promise<HealthCheckResult> {
    return { status: 'healthy', message: 'OK' };
  }

  async fetchContent(
    _connection: PlatformConnectionData,
    _since: Date | null,
  ): Promise<FetchResult> {
    return {
      items: [],
      has_more: false,
      metadata: { api_calls_made: 0 },
    };
  }

  parseResponse(_rawData: unknown): ContentItemInput[] {
    return [];
  }
}

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('should register and retrieve a connector', () => {
    const github = new MockGitHubConnector();
    registry.register(github);

    const result = registry.get('github');
    expect(result).toBe(github);
    expect(result.platform).toBe('github');
    expect(result.type).toBe('api');
  });

  it('should throw NotFoundException for unregistered platform', () => {
    expect(() => registry.get('github')).toThrow(NotFoundException);
    expect(() => registry.get('github')).toThrow('No connector registered for platform: github');
  });

  it('should list all registered platform IDs', () => {
    expect(registry.listRegistered()).toEqual([]);

    registry.register(new MockGitHubConnector());
    expect(registry.listRegistered()).toEqual(['github']);

    registry.register(new MockYouTubeConnector());
    expect(registry.listRegistered()).toEqual(['github', 'youtube']);
  });

  it('should overwrite connector when registering same platform twice', () => {
    const first = new MockGitHubConnector();
    const second = new MockGitHubConnector();

    registry.register(first);
    registry.register(second);

    expect(registry.get('github')).toBe(second);
    expect(registry.listRegistered()).toEqual(['github']);
  });
});

describe('ConnectorError', () => {
  it('should create error with all properties', () => {
    const error = new ConnectorError('github', 'AUTH_EXPIRED', 'Token expired', true);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.name).toBe('ConnectorError');
    expect(error.platform).toBe('github');
    expect(error.code).toBe('AUTH_EXPIRED');
    expect(error.message).toBe('Token expired');
    expect(error.retryable).toBe(true);
  });

  it('should default retryable to false', () => {
    const error = new ConnectorError('youtube', 'PLATFORM_ERROR', 'Something went wrong');

    expect(error.retryable).toBe(false);
  });

  it('should support all error codes', () => {
    const codes = [
      'AUTH_EXPIRED',
      'AUTH_REVOKED',
      'RATE_LIMITED',
      'PLATFORM_ERROR',
      'PARSE_ERROR',
      'NETWORK_ERROR',
      'ACCOUNT_SUSPENDED',
    ] as const;

    for (const code of codes) {
      const error = new ConnectorError('github', code, `Error: ${code}`);
      expect(error.code).toBe(code);
    }
  });
});
