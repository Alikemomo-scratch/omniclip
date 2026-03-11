import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConnectorRegistry } from './connector.registry';
import { GitHubConnector } from './github/github.connector';
import { XiaohongshuConnector } from './xiaohongshu/xiaohongshu.connector';
import { TwitterConnector } from './twitter/twitter.connector';

/**
 * Global module that provides the ConnectorRegistry.
 * Connectors are registered at module init time via onModuleInit.
 */
@Global()
@Module({
  providers: [ConnectorRegistry, GitHubConnector, XiaohongshuConnector, TwitterConnector],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly github: GitHubConnector,
    private readonly xiaohongshu: XiaohongshuConnector,
    private readonly twitter: TwitterConnector,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.github);
    this.registry.register(this.xiaohongshu);
    this.registry.register(this.twitter);
  }
}
