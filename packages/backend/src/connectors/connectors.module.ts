import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConnectorRegistry } from './connector.registry';
import { GitHubConnector } from './github/github.connector';

/**
 * Global module that provides the ConnectorRegistry.
 * Connectors are registered at module init time via onModuleInit.
 */
@Global()
@Module({
  providers: [ConnectorRegistry, GitHubConnector],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly github: GitHubConnector,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.github);
  }
}
