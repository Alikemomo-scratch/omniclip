import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConnectorRegistry } from './connector.registry';
import { GitHubConnector } from './github/github.connector';
import { TwitterConnector } from './twitter/twitter.connector';
import { YouTubeConnector } from './youtube/youtube.connector';

/**
 * Global module that provides the ConnectorRegistry.
 * Connectors are registered at module init time via onModuleInit.
 */
@Global()
@Module({
  providers: [
    ConnectorRegistry,
    GitHubConnector,
    TwitterConnector,
    YouTubeConnector,
  ],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly github: GitHubConnector,
    private readonly twitter: TwitterConnector,
    private readonly youtube: YouTubeConnector,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.github);
    this.registry.register(this.twitter);
    this.registry.register(this.youtube);
  }
}
