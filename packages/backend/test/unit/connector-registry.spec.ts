import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConnectorRegistry } from '../../src/connectors/connector.registry';
import type {
  PlatformConnector,
  PlatformId,
  ConnectionType,
  HealthCheckResult,
  FetchResult,
  ContentItemInput,
  PlatformConnectionData,
} from '@omniclip/shared';
import { GitHubConnector } from '../../src/connectors/github/github.connector';
import { TwitterConnector } from '../../src/connectors/twitter/twitter.connector';
import { YouTubeConnector } from '../../src/connectors/youtube/youtube.connector';

// Mock connector for testing extensibility
class MockConnector implements PlatformConnector {
  readonly platform = 'mock-platform' as PlatformId;
  readonly type: ConnectionType = 'api';

  async healthCheck(connection: PlatformConnectionData): Promise<HealthCheckResult> {
    return { status: 'healthy', message: 'Mock is healthy' };
  }

  async fetchContent(connection: PlatformConnectionData, since: Date | null): Promise<FetchResult> {
    return { items: [], has_more: false, metadata: { api_calls_made: 1 } };
  }

  parseResponse(rawData: unknown): ContentItemInput[] {
    return [];
  }
}

describe('ConnectorRegistry (Extensibility)', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('should register a new mock connector and retrieve it', () => {
    const mockConnector = new MockConnector();
    registry.register(mockConnector);

    const retrieved = registry.get('mock-platform' as PlatformId);
    expect(retrieved).toBeDefined();
    expect(retrieved.platform).toBe('mock-platform');
    expect(retrieved.type).toBe('api');
  });

  it('should list registered platforms', () => {
    const mockConnector = new MockConnector();
    registry.register(mockConnector);

    const registered = registry.listRegistered();
    expect(registered).toContain('mock-platform');
    expect(registered.length).toBe(1);
  });

  it('should throw NotFoundException for unregistered platform', () => {
    expect(() => registry.get('unregistered' as PlatformId)).toThrow(NotFoundException);
    expect(() => registry.get('unregistered' as PlatformId)).toThrow(
      'No connector registered for platform: unregistered',
    );
  });

  describe('Real Connectors Architecture Validation', () => {
    it('should verify all 3 real connectors implement PlatformConnector interface', () => {
      const connectors = [
        GitHubConnector,
        TwitterConnector,
        YouTubeConnector,
      ];

      for (const ConnectorClass of connectors) {
        // We verify that the prototype has the required methods
        const prototype = ConnectorClass.prototype;
        expect(typeof prototype.healthCheck).toBe('function');
        expect(typeof prototype.fetchContent).toBe('function');
        expect(typeof prototype.parseResponse).toBe('function');
      }
    });
  });
});
