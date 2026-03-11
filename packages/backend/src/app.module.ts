import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './common/config';
import { DatabaseModule } from './common/database';
import { AuthModule } from './auth';
import { UsersModule } from './users';
import { SyncModule } from './sync';
import { ConnectorsModule } from './connectors';
import { ConnectionsModule } from './connections';
import { ContentModule } from './content';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    SyncModule,
    ConnectorsModule,
    ConnectionsModule,
    ContentModule,
  ],
})
export class AppModule {}
