import { Global, Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector.registry';

/**
 * Global module that provides the ConnectorRegistry.
 * Individual platform connectors (GitHub, YouTube, etc.) will be
 * added as providers and registered in onModuleInit when implemented.
 */
@Global()
@Module({
  providers: [ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
