import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlatformId, PlatformConnector } from '@omniclip/shared';

/**
 * Registry for platform connectors.
 * Connectors register themselves at module init time; the sync module
 * and connections module look up connectors by platform ID at runtime.
 */
@Injectable()
export class ConnectorRegistry {
  private connectors = new Map<PlatformId, PlatformConnector>();

  /**
   * Register a connector implementation for a platform.
   */
  register(connector: PlatformConnector): void {
    this.connectors.set(connector.platform, connector);
  }

  /**
   * Get the connector for a given platform.
   * @throws NotFoundException if no connector is registered for the platform.
   */
  get(platform: PlatformId): PlatformConnector {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new NotFoundException(`No connector registered for platform: ${platform}`);
    }
    return connector;
  }

  /**
   * List all registered platform IDs.
   */
  listRegistered(): PlatformId[] {
    return Array.from(this.connectors.keys());
  }
}
